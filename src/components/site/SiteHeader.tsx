"use client";
import Link from "next/link";

export function SiteHeader({ right }: { right?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3 px-6 md:px-8 py-5 max-w-6xl mx-auto">
      <Link href="/" className="flex items-center gap-3"><span className="text-accent text-xl">◉</span><span className="tracking-[.3em] text-sm font-semibold">NEXUS</span></Link>
      <nav className="flex items-center gap-1 text-sm">
        <Link className="btn btn-ghost" href="/">My plans</Link>
        <Link className="btn btn-ghost" href="/pricing">Pricing</Link>
        <Link className="btn btn-ghost" href="/directory">Find professionals</Link>
        {right}
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="max-w-6xl mx-auto px-8 py-10 text-xs text-ink3 flex flex-wrap gap-x-6 gap-y-2 border-t border-line mt-16">
      <span>© {new Date().getFullYear()} NEXUS</span>
      <Link href="/pricing">Pricing</Link>
      <Link href="/directory">Professionals directory</Link>
      <Link href="/directory/join">List your practice</Link>
      <span>Ideas are encrypted in your browser — we can&apos;t read them.</span>
      <span>Guidance only — not legal, tax or financial advice.</span>
    </footer>
  );
}
