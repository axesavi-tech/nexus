"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";
import { LEGAL, POLICIES } from "@/lib/legal";
import { useSession } from "@/lib/useSession";

/** Live credit balance: reads the caller's own wallet (RLS) and listens for updates after AI steps. */
export function useCredits() {
  const [balance, setBalance] = useState<number | null>(null);
  useEffect(() => {
    const sb = supabaseBrowser();
    let alive = true;
    const load = async () => {
      if (!sb) return;
      const { data: s } = await sb.auth.getSession();
      if (!s.session) return;
      const { data } = await sb.from("billing_wallets").select("balance").maybeSingle();
      if (alive && data) setBalance(data.balance);
    };
    load();
    const onUpdate = (e: Event) => { const b = (e as CustomEvent<number>).detail; if (typeof b === "number") setBalance(b); else load(); };
    window.addEventListener("nexus:credits", onUpdate);
    return () => { alive = false; window.removeEventListener("nexus:credits", onUpdate); };
  }, []);
  return balance;
}

export function CreditsChip({ compact = false }: { compact?: boolean }) {
  const balance = useCredits();
  if (balance === null) return null;
  const low = balance < 40;
  return (
    <Link href="/pricing" className={`chip transition hover:!text-ink ${low ? "!border-warn !text-warn" : ""}`} title="Credits — add more on the Pricing page">
      <span aria-hidden>◆</span>{balance.toLocaleString("en-IN")}{compact ? "" : " credits"}
    </Link>
  );
}

const NAV = [
  { href: "/", label: "New thought" },
  { href: "/library", label: "Library" },
  { href: "/pricing", label: "Pricing" },
  { href: "/account", label: "Account" },
];

export function TopNav({ right }: { right?: React.ReactNode }) {
  const path = usePathname();
  const { session, enabled } = useSession();
  const signedIn = enabled && Boolean(session);
  return (
    <header className="flex items-center justify-between gap-4 px-6 md:px-8 py-5">
      <Link href="/" className="flex items-center gap-3 shrink-0"><span className="text-accent text-xl">◉</span><span className="tracking-[.3em] text-sm font-semibold">NEXUS</span></Link>
      <nav className="hidden md:flex items-center gap-1 text-sm" aria-label="Main">
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={`px-3 py-1.5 rounded-lg transition ${path === n.href ? "text-ink bg-panel" : "text-ink3 hover:text-ink"}`}>{n.label}</Link>
        ))}
      </nav>
      <div className="flex items-center gap-2 text-xs text-ink3">
        {right}
        {signedIn && <CreditsChip />}
        {enabled && !signedIn && <Link className="btn btn-primary !text-xs" href="/library">Sign in</Link>}
        {signedIn && <button className="btn btn-ghost !text-xs" onClick={() => supabaseBrowser()!.auth.signOut().then(() => { window.location.href = "/"; })}>Sign out</button>}
      </div>
    </header>
  );
}

export function SiteFooter() {
  const year = new Date().getFullYear();
  const legal = POLICIES.filter((p) => p.slug !== "security" && p.slug !== "contact");
  return (
    <footer className="border-t border-line mt-16">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-12 grid gap-10 md:grid-cols-[1.4fr_1fr_1.2fr_1fr]">
        <div>
          <div className="flex items-center gap-3 mb-3"><span className="text-accent text-lg">◉</span><span className="tracking-[.3em] text-sm font-semibold">NEXUS</span></div>
          <p className="serif text-lg text-ink2 leading-snug mb-4">Every thought has potential.</p>
          <ul className="text-xs text-ink3 space-y-1.5">
            <li>🔒 Encrypted in transit (TLS) and at rest (AES-256)</li>
            <li>🇮🇳 Data stored in Mumbai, India</li>
            <li>⛨ Private workspace per account, isolated by row-level security</li>
            <li>₹ Payments secured by Cashfree · card details never touch our servers</li>
          </ul>
        </div>
        <FooterCol title="Product" links={[["/", "Thought Room"], ["/library", "Library"], ["/pricing", "Pricing"], ["/account", "Account & data"]]} />
        <FooterCol title="Legal" links={legal.map((p) => [`/legal/${p.slug}`, p.title] as [string, string])} />
        <FooterCol title="Trust" links={[["/legal/security", "Security"], ["/legal/data", "Where your data lives"], ["/legal/contact", "Contact & grievances"], [`mailto:${LEGAL.email}`, LEGAL.email]]} />
      </div>
      <div className="border-t border-line">
        <div className="max-w-6xl mx-auto px-6 md:px-8 py-5 flex flex-wrap gap-x-6 gap-y-2 justify-between text-xs text-ink3">
          <span>© {year} {LEGAL.operator}. {LEGAL.address}.</span>
          <span>Grievance Officer: {LEGAL.grievanceOfficer} · <a className="hover:text-ink" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a></span>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ title, links }: { title: string; links: [string, string][] }) {
  return (
    <div>
      <div className="label mb-3">{title}</div>
      <ul className="space-y-2 text-sm">
        {links.map(([href, label]) => (
          <li key={href}>{href.startsWith("mailto:") ? <a className="text-ink2 hover:text-ink break-all" href={href}>{label}</a> : <Link className="text-ink2 hover:text-ink" href={href}>{label}</Link>}</li>
        ))}
      </ul>
    </div>
  );
}
