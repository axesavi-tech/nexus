import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { LEGAL, POLICIES, type PolicySlug } from "@/lib/legal";
import { CONTENT } from "./content";
import { SiteFooter, TopNav } from "@/components/SiteChrome";

export function generateStaticParams() { return POLICIES.map((p) => ({ slug: p.slug })); }

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const p = POLICIES.find((x) => x.slug === slug);
  return { title: p ? `${p.title} — NEXUS` : "NEXUS" };
}

export default async function LegalPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const policy = POLICIES.find((x) => x.slug === slug);
  if (!policy) notFound();
  return (
    <main className="min-h-screen glow">
      <TopNav />
      <div className="max-w-6xl mx-auto px-6 md:px-8 pt-8 grid md:grid-cols-[220px_1fr] gap-10">
        <aside className="hidden md:block">
          <div className="label mb-3">Policies</div>
          <ul className="space-y-1 text-sm sticky top-6">
            {POLICIES.map((p) => (
              <li key={p.slug}><Link href={`/legal/${p.slug}`} className={`block px-3 py-1.5 rounded-lg ${p.slug === slug ? "bg-panel text-ink" : "text-ink3 hover:text-ink"}`}>{p.title}</Link></li>
            ))}
          </ul>
        </aside>
        <article className="max-w-3xl fade-in">
          <div className="label mb-3">Legal · effective {LEGAL.effective}</div>
          <h1 className="serif text-4xl md:text-5xl mb-8">{policy.title}</h1>
          {CONTENT[slug as PolicySlug]}
        </article>
      </div>
      <SiteFooter />
    </main>
  );
}
