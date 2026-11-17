"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase";

type CashfreeFactory = (o: { mode: "sandbox" | "production" }) => { checkout: (o: { paymentSessionId: string; redirectTarget?: string }) => Promise<unknown> };
declare global { interface Window { Cashfree?: CashfreeFactory } }

function loadCashfree(): Promise<CashfreeFactory> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) return resolve(window.Cashfree);
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.async = true;
    s.onload = () => (window.Cashfree ? resolve(window.Cashfree) : reject(new Error("Payment library failed to load")));
    s.onerror = () => reject(new Error("Could not reach the payment gateway. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

export function BuyButton({ packId, label, primary }: { packId: string; label: string; primary?: boolean }) {
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    const sb = supabaseBrowser();
    const { data } = sb ? await sb.auth.getSession() : { data: { session: null } };
    if (!data.session) { window.location.href = `/account?buy=${packId}`; return; }
    setOpen(true);
  };

  const pay = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const { data } = await supabaseBrowser()!.auth.getSession();
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${data.session?.access_token ?? ""}` },
        body: JSON.stringify({ packId, phone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Could not start checkout.");
      const Cashfree = await loadCashfree();
      await Cashfree({ mode: json.mode === "production" ? "production" : "sandbox" }).checkout({ paymentSessionId: json.paymentSessionId, redirectTarget: "_self" });
    } catch (x) { setErr((x as Error).message); setBusy(false); }
  };

  return (
    <>
      <button className={`btn w-full justify-center ${primary ? "btn-primary" : ""}`} onClick={start}>{label}</button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/60 grid place-items-center p-4" role="dialog" aria-modal="true" aria-labelledby="buy-title" onClick={() => !busy && setOpen(false)}>
          <form className="card p-6 w-full max-w-sm fade-in" onClick={(e) => e.stopPropagation()} onSubmit={pay}>
            <h3 id="buy-title" className="serif text-2xl mb-2">Secure checkout</h3>
            <p className="text-sm text-ink3 mb-4">Pay with UPI, card, net banking or wallet on Cashfree&rsquo;s secure page. The gateway needs a mobile number for payment alerts; we don&rsquo;t store it.</p>
            <label className="block mb-3"><span className="label">Mobile number</span>
              <div className="flex mt-1"><span className="input !w-16 !rounded-r-none text-ink3 text-center">+91</span>
                <input className="input !rounded-l-none" inputMode="numeric" autoComplete="tel-national" required pattern="[6-9][0-9]{9}" maxLength={10} value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} placeholder="98XXXXXXXX" autoFocus />
              </div>
            </label>
            {err && <p className="text-sm text-danger mb-3" role="alert">{err}</p>}
            <div className="flex gap-2">
              <button type="button" className="btn btn-ghost flex-1 justify-center" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary flex-1 justify-center" disabled={busy}>{busy ? <span className="pulse">Opening…</span> : "Continue to pay"}</button>
            </div>
            <p className="text-[11px] text-ink3 mt-4">🔒 Payments processed by Cashfree Payments (RBI-authorised). Card and UPI details never reach NEXUS.</p>
          </form>
        </div>
      )}
    </>
  );
}
