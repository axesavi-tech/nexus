/**
 * Zero-knowledge vault (client-side encryption).
 *
 * - A random 256-bit data key (DEK) encrypts every project with AES-GCM in the browser.
 * - The DEK is stored only in wrapped (encrypted) form, twice:
 *     1. wrapped by a key derived from the user's vault passphrase (PBKDF2-SHA-256, 600,000 iterations)
 *     2. wrapped by a key derived from a one-time recovery key shown to the user once
 * - Neither the passphrase, the recovery key nor the DEK ever leaves the browser. The database holds only
 *   ciphertext, so the operator cannot read ideas — and cannot recover them if both secrets are lost.
 * - The unwrapped DEK lives in memory; with "remember this device" it is kept as a NON-EXTRACTABLE CryptoKey
 *   in IndexedDB (usable by this browser, never readable as bytes).
 */
export interface VaultMeta {
  v: 1;
  salt: string;          // base64, passphrase KDF salt
  iter: number;
  wrappedByPass: string; // base64(iv|ciphertext)
  recSalt: string;
  wrappedByRecovery: string;
  createdAt: string;
}
export interface Sealed { v: 1; iv: string; ct: string }

const te = new TextEncoder(), td = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;
export const b64 = (u: Uint8Array) => { let s = ""; for (const b of u) s += String.fromCharCode(b); return btoa(s); };
export const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
const buf = (u: Uint8Array) => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export const PASS_ITER = 600_000;
const REC_ITER = 100_000; // recovery key already has 160 bits of entropy

async function kdf(secret: string, salt: Uint8Array, iter: number): Promise<CryptoKey> {
  const base = await subtle().importKey("raw", buf(te.encode(secret.normalize("NFKC"))), "PBKDF2", false, ["deriveKey"]);
  return subtle().deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: buf(salt), iterations: iter }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
async function wrap(kek: CryptoKey, raw: Uint8Array): Promise<string> {
  const iv = rand(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, kek, buf(raw)));
  const out = new Uint8Array(iv.length + ct.length); out.set(iv); out.set(ct, iv.length);
  return b64(out);
}
async function unwrap(kek: CryptoKey, packed: string): Promise<Uint8Array> {
  const p = unb64(packed);
  return new Uint8Array(await subtle().decrypt({ name: "AES-GCM", iv: buf(p.slice(0, 12)) }, kek, buf(p.slice(12))));
}
const importDek = (raw: Uint8Array, extractable = false) => subtle().importKey("raw", buf(raw), { name: "AES-GCM" }, extractable, ["encrypt", "decrypt"]);

/** Human-friendly recovery key: 32 chars of Crockford base32 (160 bits) in groups of 4. */
const ALPHA = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export function newRecoveryKey(): string {
  const bytes = rand(20);
  let bits = "", out = "";
  for (const b of bytes) bits += b.toString(2).padStart(8, "0");
  for (let i = 0; i < 160; i += 5) out += ALPHA[parseInt(bits.slice(i, i + 5), 2)];
  return out.match(/.{4}/g)!.join("-");
}
export const normRecovery = (s: string) => s.toUpperCase().replace(/[^0-9A-Z]/g, "").replace(/O/g, "0").replace(/[IL]/g, "1");

export function passphraseProblems(p: string): string[] {
  const out: string[] = [];
  if (p.length < 12) out.push("Use at least 12 characters (a short sentence works well).");
  if (new Set(p).size < 6) out.push("Use more varied characters.");
  return out;
}

export async function createVault(passphrase: string, iter = PASS_ITER): Promise<{ meta: VaultMeta; recoveryKey: string; key: CryptoKey }> {
  const dek = rand(32), salt = rand(16), recSalt = rand(16), recoveryKey = newRecoveryKey();
  const meta: VaultMeta = {
    v: 1, salt: b64(salt), iter, recSalt: b64(recSalt), createdAt: new Date().toISOString(),
    wrappedByPass: await wrap(await kdf(passphrase, salt, iter), dek),
    wrappedByRecovery: await wrap(await kdf(normRecovery(recoveryKey), recSalt, REC_ITER), dek),
  };
  const key = await importDek(dek);
  dek.fill(0);
  return { meta, recoveryKey, key };
}

export async function unlockWithPassphrase(meta: VaultMeta, passphrase: string): Promise<CryptoKey> {
  try {
    const raw = await unwrap(await kdf(passphrase, unb64(meta.salt), meta.iter), meta.wrappedByPass);
    const k = await importDek(raw); raw.fill(0); return k;
  } catch { throw new Error("That passphrase doesn't open this vault."); }
}

/** Unlock with the recovery key and set a NEW passphrase (returns updated meta to save). */
export async function recoverAndReset(meta: VaultMeta, recoveryKey: string, newPassphrase: string, iter = PASS_ITER): Promise<{ meta: VaultMeta; key: CryptoKey }> {
  let raw: Uint8Array;
  try { raw = await unwrap(await kdf(normRecovery(recoveryKey), unb64(meta.recSalt), REC_ITER), meta.wrappedByRecovery); }
  catch { throw new Error("That recovery key doesn't open this vault."); }
  const salt = rand(16);
  const next: VaultMeta = { ...meta, salt: b64(salt), iter, wrappedByPass: await wrap(await kdf(newPassphrase, salt, iter), raw) };
  const key = await importDek(raw); raw.fill(0);
  return { meta: next, key };
}

export async function seal(key: CryptoKey, value: unknown): Promise<Sealed> {
  const iv = rand(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: "AES-GCM", iv: buf(iv) }, key, buf(te.encode(JSON.stringify(value)))));
  return { v: 1, iv: b64(iv), ct: b64(ct) };
}
export async function open<T>(key: CryptoKey, s: Sealed): Promise<T> {
  const pt = await subtle().decrypt({ name: "AES-GCM", iv: buf(unb64(s.iv)) }, key, buf(unb64(s.ct)));
  return JSON.parse(td.decode(pt)) as T;
}
export const isSealed = (x: unknown): x is Sealed => !!x && typeof x === "object" && (x as Sealed).v === 1 && typeof (x as Sealed).ct === "string" && typeof (x as Sealed).iv === "string";

// ---------------- in-memory key + optional device memory (IndexedDB, non-extractable) ----------------
let current: CryptoKey | null = null;
export const vaultKey = () => current;
export const setVaultKey = (k: CryptoKey | null) => { current = k; };

const DB = "nexus-vault", STORE = "keys";
function idb(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE);
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function rememberOnDevice(userId: string, key: CryptoKey) {
  const db = await idb();
  await new Promise<void>((res, rej) => { const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).put(key, userId); t.oncomplete = () => res(); t.onerror = () => rej(t.error); });
}
export async function recallFromDevice(userId: string): Promise<CryptoKey | null> {
  try {
    const db = await idb();
    return await new Promise((res) => { const r = db.transaction(STORE).objectStore(STORE).get(userId); r.onsuccess = () => res((r.result as CryptoKey) ?? null); r.onerror = () => res(null); });
  } catch { return null; }
}
export async function forgetDevice(userId: string) {
  try { const db = await idb(); const t = db.transaction(STORE, "readwrite"); t.objectStore(STORE).delete(userId); } catch { /* ignore */ }
}
