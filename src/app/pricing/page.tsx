"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "@/components/AuthGate";
import { SiteFooter, SiteHeader } from "@/components/site/SiteHeader";
import { PRODUCTS, available, rupees, type Entitlement, type ProductId } from "@/lib/billing";
import { buy } from "@/lib/checkout";
import { supabaseBrowser } from "@/lib/supabase";

const FREE = ["Understand what your idea is really about", "Customer profiles and the problems worth solving", "Four different ways to do it, compared"];
const FULL = ["Cheap tests to check it before you spend", "The numbers: upfront cash, payback, cautious case", "Company setup for your country — researched live, with official links", "A dated delivery plan and a one-page plan to share", "Re-run any step on that idea as often as you need (fair use)"];

export default function PricingPage() {
  const { session, ready } = useSession();
  const [ent, setEnt] = useState<Entitlement | null>(null);
  const [status, setStatus] = useState<{ payments?: boolean } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<ProductId | null>(null);

  const refresh = async () => {
    const sb = supabaseBrowser();
    if (!sb || !session) return;
    const { data } = await sb.from("entitlements").select("plan,plan_until,plan_credits,credits").maybeSingle();
    setEnt((data as Entitlement) ?? null);
  };
  useEffect(() => { fetch("/api/ai/status").then((r) => r.json()).then(setStatus).catch(() => {}); }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { refresh(); }, [session]);

  const purchase = async (id: ProductId) => {
    setMsg(null);
    if (!session) { setMsg("Sign in (or create an account) on the home page first, then come back to buy."); return; }
    setBusy(id);
    const r = await buy(id);
    setBusy(null);
    if (r.ok) { setMsg(`Thank you — ${PRODUCTS[id].name} is active.`); refresh(); }
    else if (!r.cancelled) setMsg(r.error ?? "Payment failed.");
  };
  const a = available(ent);
  const payOn = status?.payments;

  const Card = ({ title, price, per, items, cta, highlight }: { title: string; price: string; per?: string; items: string[]; cta?: React.ReactNode; highlight?: boolean }) => (
    <div className={`card p-6 flex flex-col ${highlight ? "!border-accent shadow-lg" : ""}`}>
      <h2 className="serif text-2xl">{title}</h2>
      <div className="mt-2 mb-4"><span className="serif text-4xl">{price}</span>{per && <span className="text-ink3 text-sm"> {per}</span>}</div>
      <ul className="space-y-2 text-sm mb-6 flex-1">{items.map((x) => <li key={x} className="flex gap-2"><span className="text-accent2">✓</span>{x}</li>)}</ul>
      {cta}
    </div>
  );
  const Buy = ({ id, label }: { id: ProductId; label: string }) => (
    <button className="btn btn-primary w-full justify-center" disabled={!payOn || busy !== null} onClick={() => purchase(id)}>{busy === id ? "Opening payment…" : label}</button>
  );

  return (
    <main className="min-h-screen">
      <SiteHeader />
      <section className="max-w-6xl mx-auto px-6 pt-8 pb-6 text-center">
        <h1 className="serif text-5xl mb-3">Simple pricing</h1>
        <p className="text-ink2 text-lg max-w-2xl mx-auto">Try the first steps free. Pay only when you want the full plan for an idea. Prices include applicable taxes.</p>
        {ready && session && ent && <p className="mt-4 text-sm"><span className="chip !border-accent2 !text-accent2">You have {a.total} idea{a.total === 1 ? "" : "s"} to unlock{a.planActive ? ` · ${ent.plan === "pro" ? "Pro" : "Founder"} until ${new Date(ent.plan_until!).toLocaleDateString()}` : ""}</span></p>}
        {status && !payOn && <p className="mt-4 text-sm text-warn">Payments are being switched on — everything is free to use in the meantime.</p>}
        {msg && <p className="mt-4 text-sm" role="status">{msg}</p>}
      </section>
      <section className="max-w-6xl mx-auto px-6 grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Free taster" price="₹0" items={FREE} cta={<Link className="btn w-full justify-center" href="/">Start an idea</Link>} />
        <Card title="Plan Pass" price={rupees(PRODUCTS.pass.amount)} per="per idea" items={["Everything in the taster, plus:", ...FULL]} highlight cta={<Buy id="pass" label="Buy a Plan Pass" />} />
        <Card title="Founder" price={rupees(PRODUCTS.founder.amount)} per="/ month" items={[`${PRODUCTS.founder.planCredits} ideas a month, each with the full plan`, "Unused ideas don't roll over", "Extra ideas " + rupees(PRODUCTS.topup.amount) + " each", "Paid month by month — no automatic renewal"]} cta={<Buy id="founder" label="Start Founder" />} />
        <Card title="Pro" price={rupees(PRODUCTS.pro.amount)} per="/ month" items={[`${PRODUCTS.pro.planCredits} ideas a month — for advisers, studios and serial founders`, "Extra ideas " + rupees(PRODUCTS.topup.amount) + " each", "Paid month by month — no automatic renewal"]} cta={<Buy id="pro" label="Start Pro" />} />
      </section>
      <section className="max-w-6xl mx-auto px-6 mt-6 grid md:grid-cols-2 gap-4">
        <div className="card p-5 flex flex-wrap items-center gap-4">
          <div className="flex-1 min-w-[200px]"><div className="font-semibold">Need one more idea this month?</div><div className="text-sm text-ink2">{rupees(PRODUCTS.topup.amount)} per extra idea — never expires.</div></div>
          <button className="btn" disabled={!payOn || busy !== null} onClick={() => purchase("topup")}>{busy === "topup" ? "Opening…" : `Buy extra idea · ${rupees(PRODUCTS.topup.amount)}`}</button>
        </div>
        <div className="card p-5"><div className="font-semibold">Outside India? $15 / month</div><div className="text-sm text-ink2">International card payments with local tax handled for you are coming soon.</div></div>
      </section>
      <section className="max-w-3xl mx-auto px-6 mt-12 text-sm text-ink2 space-y-3">
        <h2 className="serif text-2xl text-ink">Questions</h2>
        <p><b>What counts as one idea?</b> One plan in your list. Once an idea is unlocked you can re-run any step on it — the cheap tests, the numbers, the country research, the delivery plan.</p>
        <p><b>Can you read my ideas?</b> No. They are encrypted in your browser with a key only your vault passphrase opens. When you ask the AI to work on an idea, that text goes over an encrypted connection to the AI model to be processed; we don&apos;t store it on our servers.</p>
        <p><b>Is the company-setup guidance legal advice?</b> No — it&apos;s researched guidance with official links. Confirm with the authority or a local professional; you can find one in our <Link className="underline" href="/directory">directory</Link>.</p>
      </section>
      <SiteFooter />
    </main>
  );
}
