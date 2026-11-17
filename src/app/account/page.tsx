"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AuthGate } from "@/components/AuthGate";
import { SiteFooter, TopNav, useCredits } from "@/components/SiteChrome";
import { supabaseBrowser } from "@/lib/supabase";
import { getRepo } from "@/lib/repo";
import { saveBlob } from "@/lib/exporters";
import { OP_ESTIMATES, packById } from "@/lib/billing/pricing";

interface Ledger { id: number; delta: number; balance_after: number; kind: string; operation: string | null; ref: string | null; created_at: string }
interface Order { id: string; pack_id: string; credits: number; amount_inr: number; status: string; created_at: string; paid_at: string | null }

const describe = (l: Ledger) =>
  l.kind === "usage" ? (OP_ESTIMATES[l.operation ?? ""]?.label ?? l.operation ?? "AI step")
    : l.kind === "purchase" ? `Purchased credits (${l.ref})` : l.kind === "signup_bonus" ? "Welcome credits" : l.kind === "refund" ? "Refund" : "Adjustment";

async function authHeader() {
  const { data } = await supabaseBrowser()!.auth.getSession();
  return { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` };
}

function Account() {
  const credits = useCredits();
  const [email, setEmail] = useState("");
  const [ledger, setLedger] = useState<Ledger[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [confirmDel, setConfirmDel] = useState("");

  const refresh = async () => {
    const sb = supabaseBrowser(); if (!sb) return;
    const [{ data: u }, l, o] = await Promise.all([
      sb.auth.getUser(),
      sb.from("billing_ledger").select("id,delta,balance_after,kind,operation,ref,created_at").order("created_at", { ascending: false }).limit(100),
      sb.from("billing_orders").select("id,pack_id,credits,amount_inr,status,created_at,paid_at").order("created_at", { ascending: false }).limit(50),
    ]);
    setEmail(u.user?.email ?? "");
    setLedger((l.data ?? []) as Ledger[]);
    setOrders((o.data ?? []) as Order[]);
    window.dispatchEvent(new CustomEvent("nexus:credits"));
  };

  useEffect(() => {
    refresh();
    const qs = new URLSearchParams(window.location.search);
    const orderId = qs.get("order_id");
    const buy = qs.get("buy");
    if (buy && packById(buy)) setNotice({ tone: "ok", text: "You're signed in — choose your pack on the Pricing page to continue." });
    if (orderId) {
      setNotice({ tone: "warn", text: "Confirming your payment…" });
      (async () => {
        for (let attempt = 0; attempt < 6; attempt++) {
          const res = await fetch("/api/billing/verify", { method: "POST", headers: await authHeader(), body: JSON.stringify({ orderId }) });
          const json = await res.json().catch(() => ({}));
          if (json.status === "paid") { setNotice({ tone: "ok", text: `Payment received — ${json.credits?.toLocaleString("en-IN") ?? ""} credits added. Thank you!` }); await refresh(); break; }
          if (!res.ok || ["failed", "expired", "terminated", "amount_mismatch"].includes(json.status)) { setNotice({ tone: "err", text: json.error ?? "The payment did not complete. No money was taken; if it was, it will be refunded automatically." }); break; }
          await new Promise((r) => setTimeout(r, 2500));
          if (attempt === 5) setNotice({ tone: "warn", text: "Your payment is still processing. Credits will appear here automatically within a few minutes." });
        }
        window.history.replaceState({}, "", "/account");
      })();
    }
  }, []);

  const exportAll = async () => {
    setBusy("export");
    try {
      const repo = getRepo();
      const list = await repo.list();
      const projects = (await Promise.all(list.map((p) => repo.load(p.id)))).filter(Boolean);
      const payload = { format: "nexus.account-export.v1", exportedAt: new Date().toISOString(), account: { email }, credits: { balance: credits, ledger }, orders, projects };
      saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), `nexus-my-data-${new Date().toISOString().slice(0, 10)}.json`);
    } finally { setBusy(null); }
  };

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy("pw");
    const { error } = await supabaseBrowser()!.auth.updateUser({ password: pw });
    setBusy(null); setPw("");
    setNotice(error ? { tone: "err", text: error.message } : { tone: "ok", text: "Password updated." });
  };

  const signOutEverywhere = async () => { await supabaseBrowser()!.auth.signOut({ scope: "global" }); window.location.href = "/"; };

  const deleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirm("This permanently deletes every project, document, task and your login. It cannot be undone. Continue?")) return;
    setBusy("del");
    const res = await fetch("/api/account/delete", { method: "POST", headers: await authHeader(), body: JSON.stringify({ confirm: confirmDel }) });
    const json = await res.json().catch(() => ({}));
    setBusy(null);
    if (!res.ok) { setNotice({ tone: "err", text: json.error ?? "Could not delete the account." }); return; }
    await supabaseBrowser()!.auth.signOut();
    window.location.href = "/";
  };

  const fmt = (d: string) => new Date(d).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const toneCls = notice?.tone === "ok" ? "!border-ok text-ok" : notice?.tone === "err" ? "!border-danger text-danger" : "!border-warn text-warn";

  return (
    <main className="min-h-screen glow">
      <TopNav />
      <section className="max-w-5xl mx-auto px-6 md:px-8 pt-8 fade-in">
        <div className="label mb-2">Account</div>
        <h1 className="serif text-5xl mb-2">Your account</h1>
        <p className="text-ink3 mb-8">{email}</p>
        {notice && <div className={`card px-5 py-4 mb-6 ${toneCls}`} role="status">{notice.text}</div>}

        <div className="grid md:grid-cols-3 gap-4 mb-10">
          <div className="card p-6 md:col-span-1">
            <div className="label">Credit balance</div>
            <div className="serif text-6xl my-2">{credits === null ? "—" : credits.toLocaleString("en-IN")}</div>
            <Link href="/pricing" className="btn btn-primary w-full justify-center mt-2">Add credits</Link>
          </div>
          <div className="card p-6 md:col-span-2">
            <div className="label mb-3">Your data</div>
            <p className="text-sm text-ink2 mb-4">Your work is stored privately in Mumbai, India, encrypted at rest, and visible only to you. Download everything at any time, or export single projects in designed formats from your <Link className="text-accent" href="/library">Library</Link>.</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn" onClick={exportAll} disabled={busy === "export"}>{busy === "export" ? "Preparing…" : "Download all my data (JSON)"}</button>
              <Link className="btn btn-ghost" href="/legal/data">Where your data lives</Link>
            </div>
          </div>
        </div>

        <h2 className="serif text-3xl mb-3">Credit history</h2>
        <div className="card overflow-x-auto mb-10">
          <table className="w-full text-sm">
            <thead className="text-left text-ink3"><tr className="border-b border-line"><th className="p-3 font-normal">When</th><th className="p-3 font-normal">What</th><th className="p-3 font-normal text-right">Credits</th><th className="p-3 font-normal text-right">Balance</th></tr></thead>
            <tbody>
              {ledger.length === 0 ? <tr><td className="p-3 text-ink3" colSpan={4}>No activity yet.</td></tr> : ledger.map((l) => (
                <tr key={l.id} className="border-b border-line last:border-0">
                  <td className="p-3 text-ink3 whitespace-nowrap">{fmt(l.created_at)}</td><td className="p-3">{describe(l)}</td>
                  <td className={`p-3 text-right tabular-nums ${l.delta > 0 ? "text-ok" : ""}`}>{l.delta > 0 ? "+" : ""}{l.delta}</td>
                  <td className="p-3 text-right tabular-nums text-ink3">{l.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="serif text-3xl mb-3">Purchases</h2>
        <div className="card overflow-x-auto mb-10">
          <table className="w-full text-sm">
            <thead className="text-left text-ink3"><tr className="border-b border-line"><th className="p-3 font-normal">Date</th><th className="p-3 font-normal">Pack</th><th className="p-3 font-normal text-right">Amount</th><th className="p-3 font-normal">Status</th><th className="p-3 font-normal">Order ID</th></tr></thead>
            <tbody>
              {orders.length === 0 ? <tr><td className="p-3 text-ink3" colSpan={5}>No purchases yet.</td></tr> : orders.map((o) => (
                <tr key={o.id} className="border-b border-line last:border-0">
                  <td className="p-3 text-ink3 whitespace-nowrap">{fmt(o.created_at)}</td>
                  <td className="p-3">{packById(o.pack_id)?.name ?? o.pack_id} · {o.credits.toLocaleString("en-IN")} credits</td>
                  <td className="p-3 text-right tabular-nums">₹{Number(o.amount_inr).toLocaleString("en-IN")}</td>
                  <td className="p-3"><span className={`chip ${o.status === "paid" ? "!border-ok !text-ok" : o.status === "failed" ? "!border-danger !text-danger" : ""}`}>{o.status === "created" ? "pending" : o.status}</span></td>
                  <td className="p-3 font-mono text-xs text-ink3">{o.id}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <form className="card p-6" onSubmit={changePassword}>
            <h2 className="serif text-2xl mb-3">Security</h2>
            <label className="block mb-3"><span className="label">New password</span><input className="input mt-1" type="password" minLength={8} required value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></label>
            <div className="flex flex-wrap gap-2">
              <button className="btn" disabled={busy === "pw"}>Update password</button>
              <button type="button" className="btn btn-ghost" onClick={signOutEverywhere}>Sign out on all devices</button>
            </div>
          </form>
          <form className="card p-6 !border-danger/40" onSubmit={deleteAccount}>
            <h2 className="serif text-2xl mb-2 text-danger">Delete account</h2>
            <p className="text-sm text-ink3 mb-3">Permanently erases every project, document, task, version and log, and your login. Payment records are kept without your name for tax law. Download your data first.</p>
            <label className="block mb-3"><span className="label">Type your email to confirm</span><input className="input mt-1" value={confirmDel} onChange={(e) => setConfirmDel(e.target.value)} placeholder={email} /></label>
            <button className="btn !border-danger !text-danger" disabled={busy === "del" || confirmDel.trim().toLowerCase() !== email.toLowerCase()}>{busy === "del" ? "Deleting…" : "Delete my account"}</button>
          </form>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

export default function Page() { return <AuthGate><Account /></AuthGate>; }
