"use client";
import { useState } from "react";
import Link from "next/link";
import { useSession } from "@/lib/useSession";
import { SiteFooter } from "@/components/SiteChrome";

export { useSession };
import { supabaseBrowser } from "@/lib/supabase";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { enabled, session, ready } = useSession();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"in" | "up">("in");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  if (!enabled) return <>{children}</>;
  if (!ready) return <div className="h-screen grid place-items-center text-ink3">Loading…</div>;
  if (session) return <>{children}</>;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const sb = supabaseBrowser()!;
    setBusy(true); setMsg(null);
    const r = mode === "in"
      ? await sb.auth.signInWithPassword({ email, password })
      : await sb.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (r.error) setMsg(r.error.message);
    else if (mode === "up" && !r.data.session) setMsg("Check your inbox to confirm your email, then sign in.");
  };

  return (
    <main className="min-h-screen glow flex flex-col">
      <div className="flex-1 grid place-items-center px-6 py-16">
      <div className="w-full max-w-sm fade-in">
        <div className="text-center mb-8">
          <div className="label mb-3">NEXUS</div>
          <h1 className="serif text-4xl mb-3">Every thought has potential.</h1>
          <p className="text-ink2">Sign in to keep your thinking, decisions and plans in one place.</p>
        </div>
        <form onSubmit={submit} className="card p-6 space-y-3">
          <label className="block"><span className="label">Email</span><input className="input mt-1" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
          <label className="block"><span className="label">Password</span><input className="input mt-1" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} /></label>
          {msg && <p className="text-sm text-warn" role="status">{msg}</p>}
          <button className="btn btn-primary w-full justify-center" disabled={busy}>{busy ? "…" : mode === "in" ? "Sign in" : "Create account"}</button>
          <button type="button" className="btn btn-ghost w-full justify-center" onClick={() => setMode(mode === "in" ? "up" : "in")}>
            {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
          </button>
        </form>
        <p className="text-center text-xs text-ink3 mt-5">Start free with welcome credits · <Link className="text-accent" href="/pricing">See pricing</Link></p>
        <p className="text-center text-[11px] text-ink3 mt-2">By continuing you agree to the <Link className="underline" href="/legal/terms">Terms</Link> and <Link className="underline" href="/legal/privacy">Privacy Policy</Link>.</p>
      </div>
      </div>
      <SiteFooter />
    </main>
  );
}
