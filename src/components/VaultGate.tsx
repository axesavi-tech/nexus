"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase";
import {
  createVault, forgetDevice, passphraseProblems, recallFromDevice, recoverAndReset, rememberOnDevice, setVaultKey, unlockWithPassphrase,
  vaultKey, type VaultMeta,
} from "@/lib/vault";
import { useNexus } from "@/lib/store";

/** Lock the vault on this device and sign out. */
export async function lockAndSignOut() {
  const sb = supabaseBrowser();
  const uid = (await sb?.auth.getSession())?.data.session?.user.id;
  setVaultKey(null);
  if (uid) await forgetDevice(uid);
  useNexus.setState({ p: null, past: [], future: [] });
  await sb?.auth.signOut();
}

type Phase = "checking" | "setup" | "show-key" | "unlock" | "recover" | "open";

export function VaultGate({ session, children }: { session: Session; children: React.ReactNode }) {
  const uid = session.user.id;
  const meta = (session.user.user_metadata?.vault ?? null) as VaultMeta | null;
  const [phase, setPhase] = useState<Phase>(vaultKey() ? "open" : "checking");
  const [pass, setPass] = useState(""), [pass2, setPass2] = useState(""), [rec, setRec] = useState("");
  const [remember, setRemember] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [recoveryKey, setRecoveryKey] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pendingKey, setPendingKey] = useState<CryptoKey | null>(null);

  useEffect(() => {
    if (vaultKey()) { setPhase("open"); return; }
    if (!meta) { setPhase("setup"); return; }
    recallFromDevice(uid).then((k) => { if (k) { setVaultKey(k); setPhase("open"); } else setPhase("unlock"); });
    // Runs once per user: later metadata updates (vault creation, passphrase reset) must not restart the flow.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  if (phase === "open") return <>{children}</>;
  if (phase === "checking") return <div className="h-screen grid place-items-center text-ink3">Opening your vault…</div>;

  const finish = async (k: CryptoKey) => {
    if (remember) await rememberOnDevice(uid, k).catch(() => {});
    setVaultKey(k);
    setPhase("open");
  };
  const run = async (fn: () => Promise<void>) => { setBusy(true); setErr(null); try { await fn(); } catch (e) { setErr((e as Error).message); } finally { setBusy(false); } };
  const problems = passphraseProblems(pass);

  return (
    <main className="min-h-screen grid place-items-center px-6 py-10">
      <div className="w-full max-w-md fade-in">
        <div className="text-center mb-6">
          <div className="text-3xl mb-2" aria-hidden>🔒</div>
          <h1 className="serif text-3xl mb-2">{phase === "setup" ? "Create your private vault" : phase === "show-key" ? "Save your recovery key" : phase === "recover" ? "Recover your vault" : "Unlock your vault"}</h1>
          <p className="text-ink2 text-sm leading-relaxed">
            {phase === "setup" && "Your ideas are encrypted in your browser before they are saved. Only someone with your vault passphrase can read them — not us, not our database provider."}
            {phase === "show-key" && "If you forget your passphrase, this key is the only way back in. We can't reset it for you — we never see it."}
            {phase === "unlock" && "Enter your vault passphrase to decrypt your ideas on this device."}
            {phase === "recover" && "Use the recovery key you saved when you created the vault, then choose a new passphrase."}
          </p>
        </div>

        <div className="card p-6 space-y-3">
          {phase === "setup" && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
              if (problems.length) throw new Error(problems[0]);
              if (pass !== pass2) throw new Error("The two passphrases don't match.");
              const v = await createVault(pass);
              const { error } = await supabaseBrowser()!.auth.updateUser({ data: { vault: v.meta } });
              if (error) throw new Error(`Couldn't save the vault: ${error.message}`);
              setRecoveryKey(v.recoveryKey); setPendingKey(v.key); setPass(""); setPass2(""); setPhase("show-key");
            }); }}>
              <label className="block"><span className="text-sm">Vault passphrase</span><input className="input mt-1" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} placeholder="A short sentence only you know" /></label>
              {pass && problems.length > 0 && <p className="text-xs text-warn">{problems.join(" ")}</p>}
              <label className="block"><span className="text-sm">Repeat it</span><input className="input mt-1" type="password" autoComplete="new-password" value={pass2} onChange={(e) => setPass2(e.target.value)} /></label>
              <p className="text-xs text-ink3">Use a different passphrase from your sign-in password.</p>
              <Remember remember={remember} setRemember={setRemember} />
              <button className="btn btn-primary w-full justify-center" disabled={busy || !pass || !pass2}>{busy ? "Creating keys…" : "Create vault"}</button>
            </form>
          )}

          {phase === "show-key" && recoveryKey && (
            <>
              <div className="rounded-lg bg-bg2 p-4 text-center font-mono text-lg tracking-wider select-all break-all" aria-label="Recovery key">{recoveryKey}</div>
              <div className="flex gap-2">
                <button className="btn flex-1 justify-center" onClick={() => navigator.clipboard.writeText(recoveryKey).catch(() => {})}>Copy</button>
                <button className="btn flex-1 justify-center" onClick={() => {
                  const a = document.createElement("a");
                  a.href = URL.createObjectURL(new Blob([`NEXUS vault recovery key\n\n${recoveryKey}\n\nAccount: ${session.user.email}\nCreated: ${new Date().toISOString()}\n\nKeep this somewhere safe and private. Anyone with it and your sign-in can read your ideas.\n`], { type: "text/plain" }));
                  a.download = "nexus-recovery-key.txt"; a.click();
                }}>Download</button>
              </div>
              <label className="flex gap-2 items-start text-sm"><input type="checkbox" className="mt-1" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I&apos;ve saved my recovery key somewhere safe. I understand that if I lose both it and my passphrase, my ideas cannot be recovered by anyone.</label>
              <button className="btn btn-primary w-full justify-center" disabled={!saved || !pendingKey} onClick={() => run(async () => { await finish(pendingKey!); setRecoveryKey(null); })}>Continue</button>
            </>
          )}

          {phase === "unlock" && meta && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => { const k = await unlockWithPassphrase(meta, pass); setPass(""); await finish(k); }); }}>
              <label className="block"><span className="text-sm">Vault passphrase</span><input className="input mt-1" type="password" autoComplete="current-password" autoFocus value={pass} onChange={(e) => setPass(e.target.value)} /></label>
              <Remember remember={remember} setRemember={setRemember} />
              <button className="btn btn-primary w-full justify-center" disabled={busy || !pass}>{busy ? "Unlocking…" : "Unlock"}</button>
              <button type="button" className="btn btn-ghost w-full justify-center text-sm" onClick={() => { setErr(null); setPhase("recover"); }}>Forgot your passphrase? Use your recovery key</button>
            </form>
          )}

          {phase === "recover" && meta && (
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); run(async () => {
              if (problems.length) throw new Error(problems[0]);
              const r = await recoverAndReset(meta, rec, pass);
              const { error } = await supabaseBrowser()!.auth.updateUser({ data: { vault: r.meta } });
              if (error) throw new Error(`Couldn't save the new passphrase: ${error.message}`);
              setPass(""); setRec(""); await finish(r.key);
            }); }}>
              <label className="block"><span className="text-sm">Recovery key</span><input className="input mt-1 font-mono" value={rec} onChange={(e) => setRec(e.target.value)} placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX" /></label>
              <label className="block"><span className="text-sm">New vault passphrase</span><input className="input mt-1" type="password" autoComplete="new-password" value={pass} onChange={(e) => setPass(e.target.value)} /></label>
              {pass && problems.length > 0 && <p className="text-xs text-warn">{problems.join(" ")}</p>}
              <button className="btn btn-primary w-full justify-center" disabled={busy || !rec || !pass}>{busy ? "Recovering…" : "Recover and set new passphrase"}</button>
              <button type="button" className="btn btn-ghost w-full justify-center text-sm" onClick={() => setPhase("unlock")}>Back</button>
            </form>
          )}

          {err && <p className="text-sm text-danger" role="alert">{err}</p>}
        </div>
        <p className="text-[11px] text-ink3 text-center mt-4 leading-relaxed">AES-256-GCM encryption with a key derived from your passphrase (PBKDF2, 600,000 rounds). When you ask the AI to work on an idea, that text is sent over an encrypted connection to the AI model to process — it is not stored on our servers.</p>
        <button className="block mx-auto mt-3 text-xs text-ink3 hover:text-ink" onClick={lockAndSignOut}>Sign out</button>
      </div>
    </main>
  );
}

function Remember({ remember, setRemember }: { remember: boolean; setRemember: (v: boolean) => void }) {
  return <label className="flex gap-2 items-start text-sm text-ink2"><input type="checkbox" className="mt-1" checked={remember} onChange={(e) => setRemember(e.target.checked)} />Keep unlocked on this device (the key stays in this browser and can&apos;t be copied out). Untick on shared computers.</label>;
}
