import Link from "next/link";
import type { Metadata } from "next";
import { CREDIT_VALIDITY_MONTHS, OP_ESTIMATES, PACKS, SIGNUP_CREDITS, economics, estimateCredits, journeyCredits } from "@/lib/billing/pricing";
import { BuyButton } from "@/components/BuyButton";
import { SiteFooter, TopNav } from "@/components/SiteChrome";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = { title: "Pricing — NEXUS", description: "Pay only for the thinking you use. Prepaid credits, no subscription." };
export const dynamic = "force-dynamic";

const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

export default function Pricing() {
  const e = economics();
  const journey = journeyCredits(e);
  return (
    <main className="min-h-screen glow">
      <TopNav />
      <section className="max-w-5xl mx-auto px-6 pt-12 pb-10 text-center fade-in">
        <div className="label mb-4">Pricing</div>
        <h1 className="serif text-5xl md:text-6xl mb-5">Pay only for the thinking you use.</h1>
        <p className="text-ink2 text-lg max-w-2xl mx-auto">Prepaid credits. No subscription, no auto-renewal. Start with <b className="text-ink">{SIGNUP_CREDITS} free credits</b>; a full journey from a raw thought to a delivery plan uses about <b className="text-ink">{journey} credits</b>.</p>
      </section>

      <section className="max-w-5xl mx-auto px-6 grid md:grid-cols-3 gap-4">
        {PACKS.map((p) => (
          <div key={p.id} className={`card p-6 flex flex-col ${p.highlight ? "!border-accent shadow-2xl shadow-black/40" : ""}`}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="serif text-2xl">{p.name}</h2>
              {p.highlight && <span className="chip !border-accent !text-accent">Most chosen</span>}
            </div>
            <p className="text-sm text-ink3 mb-5">{p.tagline}</p>
            <div className="flex items-baseline gap-2 mb-1"><span className="serif text-5xl">{inr(p.priceInr)}</span><span className="text-ink3 text-sm">one-time</span></div>
            <div className="text-accent mb-5">{p.credits.toLocaleString("en-IN")} credits</div>
            <ul className="text-sm text-ink2 space-y-2 mb-6 flex-1">
              <li>≈ {Math.floor(p.credits / journey)} complete thought-to-plan journeys</li>
              <li>₹{(p.priceInr / p.credits).toFixed(2)} per credit</li>
              <li>Every export format included</li>
              <li>Valid {CREDIT_VALIDITY_MONTHS} months · refundable within 7 days if unused</li>
            </ul>
            <BuyButton packId={p.id} label={`Buy ${p.name}`} primary={p.highlight} />
          </div>
        ))}
      </section>

      <section className="max-w-5xl mx-auto px-6 mt-4">
        <div className="card p-6 flex flex-wrap items-center justify-between gap-4">
          <div><h2 className="serif text-2xl">Enterprise</h2><p className="text-sm text-ink3">Volume credits, invoicing with GST, a data processing agreement, single sign-on and priority support.</p></div>
          <a className="btn" href={`mailto:${LEGAL.email}?subject=NEXUS%20Enterprise`}>Talk to us</a>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-6 mt-14 grid md:grid-cols-2 gap-10">
        <div>
          <div className="label mb-2">Transparent usage</div>
          <h2 className="serif text-3xl mb-4">What each step uses</h2>
          <p className="text-sm text-ink3 mb-4">You are charged for the computing each step actually uses. Typical amounts are below; a short thought costs less, a very large plan a little more. Steps that fail are never charged.</p>
          <table className="w-full text-sm">
            <tbody>
              {Object.entries(OP_ESTIMATES).map(([k, v]) => (
                <tr key={k} className="border-b border-line"><td className="py-2.5 text-ink2">{v.label}</td><td className="py-2.5 text-right">~{estimateCredits(k, e)} credits</td></tr>
              ))}
              <tr><td className="py-2.5 font-medium">Full journey (with 3 explorations)</td><td className="py-2.5 text-right text-accent">~{journey} credits</td></tr>
              <tr className="border-t border-line"><td className="py-2.5 text-ink2">Saving, editing, exporting, version history</td><td className="py-2.5 text-right">Free</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <div className="label mb-2">Questions</div>
          <h2 className="serif text-3xl mb-4">Good to know</h2>
          <dl className="space-y-4 text-sm">
            {[
              ["Is there a subscription?", "No. Packs are one-time purchases and you are never charged automatically."],
              ["Do credits expire?", `Purchased credits are valid for ${CREDIT_VALIDITY_MONTHS} months.`],
              ["Can I get a refund?", <>Yes — a full refund within 7 days if you haven&rsquo;t used the pack. See the <Link className="text-accent" href="/legal/refunds">refund policy</Link>.</>],
              ["How do I pay?", "UPI, debit or credit card, net banking or wallets, through Cashfree Payments. Card and UPI details never reach our servers."],
              ["Where is my work stored?", <>In your private workspace, in Mumbai, India, encrypted at rest. <Link className="text-accent" href="/legal/security">How we protect it</Link>.</>],
            ].map(([q, a], i) => (<div key={i}><dt className="font-medium mb-1">{q}</dt><dd className="text-ink3">{a}</dd></div>))}
          </dl>
        </div>
      </section>
      <p className="text-center text-xs text-ink3 mt-10">Prices in Indian rupees. Taxes as applicable.</p>
      <SiteFooter />
    </main>
  );
}
