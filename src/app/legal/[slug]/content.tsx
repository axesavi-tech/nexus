import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL, type PolicySlug } from "@/lib/legal";
import { CREDIT_VALIDITY_MONTHS, SIGNUP_CREDITS } from "@/lib/billing/pricing";

const H = ({ children }: { children: ReactNode }) => <h2 className="serif text-2xl mt-10 mb-3">{children}</h2>;
const P = ({ children }: { children: ReactNode }) => <p className="text-ink2 leading-relaxed mb-3">{children}</p>;
const UL = ({ items }: { items: ReactNode[] }) => <ul className="list-disc pl-5 space-y-1.5 text-ink2 leading-relaxed mb-3">{items.map((x, i) => <li key={i}>{x}</li>)}</ul>;
const Mail = () => <a className="text-accent underline-offset-2 hover:underline" href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>;
const Pol = ({ s, children }: { s: PolicySlug; children: ReactNode }) => <Link className="text-accent underline-offset-2 hover:underline" href={`/legal/${s}`}>{children}</Link>;

const PROCESSORS = (
  <div className="overflow-x-auto mb-3">
    <table className="w-full text-sm border border-line">
      <thead className="bg-panel2 text-left"><tr><th className="p-2">Provider</th><th className="p-2">Purpose</th><th className="p-2">Location</th></tr></thead>
      <tbody className="text-ink2">
        <tr className="border-t border-line"><td className="p-2">Supabase</td><td className="p-2">Database, authentication, backups</td><td className="p-2">Mumbai, India (ap-south-1)</td></tr>
        <tr className="border-t border-line"><td className="p-2">Vercel</td><td className="p-2">Application hosting and delivery</td><td className="p-2">Mumbai, India (bom1); static files via global CDN</td></tr>
        <tr className="border-t border-line"><td className="p-2">Anthropic</td><td className="p-2">AI analysis of the content you submit to an AI step</td><td className="p-2">United States</td></tr>
        <tr className="border-t border-line"><td className="p-2">Cashfree Payments</td><td className="p-2">Payment processing (RBI-authorised payment aggregator)</td><td className="p-2">India</td></tr>
      </tbody>
    </table>
  </div>
);

export const CONTENT: Record<PolicySlug, ReactNode> = {
  privacy: (<>
    <P>This policy explains what personal data {LEGAL.brand} collects, why, and the choices you have. It is written to meet India&rsquo;s Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;) and the Information Technology Act, 2000, and follows the principles of the EU GDPR for users outside India.</P>
    <H>Who we are</H>
    <P>{LEGAL.brand} is operated by {LEGAL.operator}, {LEGAL.address} (&ldquo;we&rdquo;). We are the Data Fiduciary for the personal data described here. Contact: <Mail />.</P>
    <H>What we collect</H>
    <UL items={[
      <><b>Account data:</b> your email address and a securely hashed password (we never see or store your password in readable form).</>,
      <><b>Your content:</b> the thoughts, mind maps, ideas, evaluations, decisions, blueprints, plans and tasks you create.</>,
      <><b>Usage and billing records:</b> which AI steps you run, token counts, credits charged, timestamps, and purchase records (pack, amount, order reference).</>,
      <><b>Payment details:</b> entered directly on Cashfree&rsquo;s secure checkout. Card, UPI and bank details never reach our servers. We pass Cashfree your email and the mobile number you enter at checkout, because the gateway requires them; we do not store the mobile number.</>,
      <><b>Technical data:</b> standard server logs (IP address, browser type, error traces) kept for security and debugging.</>,
    ]} />
    <H>Why we use it (purpose and legal basis)</H>
    <UL items={[
      "To provide the service you signed up for: storing your work, running the AI steps you request, and exporting your documents (performance of our contract with you; your consent under the DPDP Act).",
      "To bill you accurately and keep statutory accounting records (legal obligation).",
      "To keep the service secure, prevent abuse and fix problems (legitimate use).",
      "To answer your support requests.",
    ]} />
    <P>We do <b>not</b> sell your data, show advertising, use advertising or tracking cookies, or use your content to train AI models. Our AI provider processes content only to return a result to you and, under its commercial terms, does not use it to train its models.</P>
    <H>Who processes your data</H>
    {PROCESSORS}
    <P>When you run an AI step, only the part of your project that step needs is sent to the AI provider. Cross-border transfers take place under section 16 of the DPDP Act and contractual safeguards with each provider.</P>
    <H>How long we keep it</H>
    <P>See our <Pol s="data">Data Processing &amp; Retention Policy</Pol>. In short: your content stays until you delete it or your account; payment records are kept as long as tax law requires.</P>
    <H>Your rights</H>
    <UL items={[
      <><b>Access and portability:</b> download everything you have created, at any time, from <Link className="text-accent" href="/account">Account → Download all my data</Link>.</>,
      "Correction: edit any of your content directly in the app, or ask us to correct account data.",
      <><b>Erasure:</b> delete individual projects from your Library, or your entire account from <Link className="text-accent" href="/account">Account → Delete account</Link>. Deletion is immediate and permanent.</>,
      "Withdraw consent: you can stop using the service and delete your account at any time.",
      "Nominate another person to exercise your rights in case of death or incapacity (DPDP Act s.14).",
      <>Grievance redressal: see <Pol s="contact">Contact &amp; Grievance Redressal</Pol>. You may also approach the Data Protection Board of India.</>,
    ]} />
    <H>Children</H>
    <P>{LEGAL.brand} is for people aged 18 and over. We do not knowingly process children&rsquo;s data; if you believe a child has signed up, contact us and we will delete the account.</P>
    <H>Security</H>
    <P>See <Pol s="security">Security</Pol> for the technical and organisational measures we use.</P>
    <H>Changes</H>
    <P>We will post any change here with a new effective date, and email you about material changes before they apply.</P>
  </>),

  terms: (<>
    <P>These terms are an agreement between you and {LEGAL.operator} (&ldquo;we&rdquo;) for use of {LEGAL.brand}. By creating an account you accept them.</P>
    <H>1. The service</H>
    <P>{LEGAL.brand} helps you turn a thought into options, a decision, a solution blueprint and a delivery plan, with AI assistance. AI output can be incomplete or wrong. It is a thinking aid, not professional (legal, financial, medical, engineering or investment) advice. You are responsible for decisions you make with it.</P>
    <H>2. Accounts</H>
    <UL items={["You must be at least 18 and able to form a binding contract.", "Keep your password secure; you are responsible for activity on your account.", "Tell us promptly at the email below if you suspect unauthorised access."]} />
    <H>3. Your content</H>
    <P>You own what you put into {LEGAL.brand} and what it produces for you. You grant us a limited licence to store, process and transmit your content solely to provide the service to you. We do not claim ownership and do not use your content to train AI models.</P>
    <H>4. Credits and payments</H>
    <UL items={[
      `New accounts receive ${SIGNUP_CREDITS} free credits. Further credits are bought in prepaid packs priced in Indian rupees.`,
      "Each AI step consumes credits based on the actual computing it used; the typical cost of each step is shown on the Pricing page. Steps that fail are not charged.",
      `Purchased credits are valid for ${CREDIT_VALIDITY_MONTHS} months from purchase and have no cash value except as set out in our Refund policy.`,
      "Payments are processed by Cashfree Payments. Taxes are charged where applicable.",
      "We may change prices for future purchases; credits you already hold keep their value.",
    ]} />
    <P>Refunds are covered by our <Pol s="refunds">Refund, Cancellation &amp; Delivery Policy</Pol>.</P>
    <H>5. Acceptable use</H>
    <P>You agree to our <Pol s="acceptable-use">Acceptable Use Policy</Pol>. We may suspend accounts that break it.</P>
    <H>6. Availability</H>
    <P>We work to keep {LEGAL.brand} available and your data safe, but the service is provided &ldquo;as is&rdquo;. We may change features, and we will give reasonable notice before discontinuing the service so you can export your work.</P>
    <H>7. Liability</H>
    <P>To the extent the law allows, we are not liable for indirect or consequential losses, and our total liability to you is limited to the amount you paid us in the 12 months before the claim. Nothing in these terms limits liability that cannot be limited by law.</P>
    <H>8. Ending the agreement</H>
    <P>You can delete your account at any time. We may suspend or end access for serious or repeated breach of these terms, with notice where practical.</P>
    <H>9. Law and disputes</H>
    <P>These terms are governed by the laws of India. Courts at {LEGAL.jurisdiction} have exclusive jurisdiction. Please contact us first; most issues can be resolved quickly.</P>
    <H>10. Changes</H>
    <P>We will post updates here and notify you of material changes in advance. Continuing to use the service after that means you accept the updated terms.</P>
  </>),

  data: (<>
    <P>This policy describes how {LEGAL.brand} processes, stores, isolates and deletes data. It complements the <Pol s="privacy">Privacy Policy</Pol>.</P>
    <H>Where your data lives</H>
    {PROCESSORS}
    <H>Your private workspace</H>
    <P>Every account has its own private workspace. Every row of stored data (projects, map nodes and links, artifacts, tasks, versions, audit events, AI logs, credits and orders) is tagged with its owner, and the database enforces row-level security so one account can never read or change another&rsquo;s data, even through a faulty request. This isolation was verified by confirming that a second account sees none of the first account&rsquo;s rows.</P>
    <H>What is sent to AI</H>
    <P>Only the content needed for the step you run, such as the focused part of your map, is sent to the AI provider over an encrypted connection. Nothing is sent to AI without an action by you.</P>
    <H>Retention</H>
    <div className="overflow-x-auto mb-3"><table className="w-full text-sm border border-line"><thead className="bg-panel2 text-left"><tr><th className="p-2">Data</th><th className="p-2">Kept for</th></tr></thead><tbody className="text-ink2">
      <tr className="border-t border-line"><td className="p-2">Projects, maps, documents, tasks, versions</td><td className="p-2">Until you delete them or your account</td></tr>
      <tr className="border-t border-line"><td className="p-2">AI usage logs and credit ledger</td><td className="p-2">Life of the account (shown to you on the Account page)</td></tr>
      <tr className="border-t border-line"><td className="p-2">Payment and order records</td><td className="p-2">As required by Indian tax law (up to 8 years), with the link to your account removed when you delete it</td></tr>
      <tr className="border-t border-line"><td className="p-2">Encrypted database backups</td><td className="p-2">Roll off within 7 days</td></tr>
      <tr className="border-t border-line"><td className="p-2">Server and security logs</td><td className="p-2">Up to 30 days</td></tr>
    </tbody></table></div>
    <H>Deletion</H>
    <P>Deleting a project removes it and all its nodes, links, artifacts, tasks and versions immediately. Deleting your account removes all of your content, logs and the login itself immediately; backups expire within 7 days.</P>
    <H>Export and portability</H>
    <P>Any project can be downloaded as a designed PDF, Word document, PowerPoint deck, Markdown, CSV task list or JSON. Your entire account can be downloaded as a single JSON file at any time.</P>
    <H>Breach notification</H>
    <P>If a personal data breach occurs, we will notify affected users and the Data Protection Board of India as the DPDP Act and its rules require, with what happened, the likely impact and the steps we are taking.</P>
  </>),

  refunds: (<>
    <H>What you are buying</H>
    <P>{LEGAL.brand} sells prepaid credit packs. Credits are a digital service used to run AI steps inside your account. Nothing physical is shipped.</P>
    <H>Delivery</H>
    <P>Credits are added to your account instantly after a successful payment, usually within a few seconds. If they have not appeared within 30 minutes, email <Mail /> with your order ID (shown on your Account page) and we will resolve it within one working day.</P>
    <H>Cancellation</H>
    <P>Packs are one-time purchases; there is no subscription to cancel and you are never charged automatically.</P>
    <H>Refunds</H>
    <UL items={[
      <><b>Unused packs:</b> request a full refund within 7 days of purchase if you have not used any credits from that pack.</>,
      <><b>Failed or duplicate payments:</b> if money left your account but credits were not added, or you were charged twice, we refund the full amount.</>,
      "Failed AI steps are never charged, so no refund is needed for them.",
      `Partly used packs, and credits older than ${CREDIT_VALIDITY_MONTHS} months, are not refundable except where the law requires.`,
    ]} />
    <P>To request a refund, email <Mail /> from your account email with the order ID. Approved refunds go back to the original payment method within 5–7 working days, through Cashfree Payments.</P>
  </>),

  cookies: (<>
    <P>{LEGAL.brand} uses only strictly necessary browser storage. We use no advertising, analytics or third-party tracking cookies.</P>
    <div className="overflow-x-auto mb-3"><table className="w-full text-sm border border-line"><thead className="bg-panel2 text-left"><tr><th className="p-2">Item</th><th className="p-2">Purpose</th><th className="p-2">Duration</th></tr></thead><tbody className="text-ink2">
      <tr className="border-t border-line"><td className="p-2">Sign-in session (local storage)</td><td className="p-2">Keeps you signed in securely</td><td className="p-2">Until you sign out</td></tr>
      <tr className="border-t border-line"><td className="p-2">Theme preference</td><td className="p-2">Remembers light or dark mode</td><td className="p-2">Until cleared</td></tr>
      <tr className="border-t border-line"><td className="p-2">Cashfree checkout</td><td className="p-2">Set by Cashfree on its payment page to complete and secure your payment</td><td className="p-2">Per Cashfree&rsquo;s policy</td></tr>
    </tbody></table></div>
    <P>Because these are essential to the service, they do not require a consent banner. You can clear them at any time in your browser; you will need to sign in again.</P>
  </>),

  "acceptable-use": (<>
    <P>To keep {LEGAL.brand} safe and useful for everyone, you agree not to use it to:</P>
    <UL items={[
      "Break any law, or plan, promote or facilitate harm to people, including violence, exploitation or self-harm.",
      "Create malware, phishing, fraud, spam, or content that infringes someone else's intellectual property or privacy.",
      "Process other people's sensitive personal data without a lawful basis.",
      "Probe, scan or test the security of the service, or bypass usage limits, billing or access controls, except under our responsible-disclosure process.",
      "Resell or provide automated bulk access to the service without our written permission.",
      "Generate content that violates the usage policies of our AI provider.",
    ]} />
    <P>We may remove content or suspend accounts that break this policy. Report misuse to <Mail />.</P>
  </>),

  security: (<>
    <P>Your thinking is often your most sensitive material. These are the measures that protect it today.</P>
    <H>Infrastructure and encryption</H>
    <UL items={[
      "All traffic is encrypted with TLS, enforced with HTTP Strict Transport Security.",
      "Data is encrypted at rest (AES-256) by our database provider, with encrypted daily backups.",
      "The database and application servers run in Mumbai, India.",
    ]} />
    <H>Isolation and access</H>
    <UL items={[
      "Row-level security in the database isolates every account: each query can only reach the caller's own rows.",
      "Privileged keys (database service key, payment and AI keys) live only on the server and are never sent to the browser.",
      "Credits can be changed only by audited server functions; users cannot change balances, prices or orders.",
      "Every change to a project is recorded in an audit trail and version history you can restore from.",
    ]} />
    <H>Application security</H>
    <UL items={[
      "A strict Content-Security-Policy, frame protection, MIME-sniffing protection and a locked-down permissions policy on every page.",
      "Every AI response is validated against a strict schema before it can touch your data.",
      "Per-user rate limits and daily caps on AI use.",
      "Passwords of at least 8 characters, stored only as salted hashes by the authentication provider.",
    ]} />
    <H>Payments</H>
    <P>Payments are handled entirely by Cashfree Payments, an RBI-authorised payment aggregator. Card, UPI and bank details are entered on Cashfree&rsquo;s PCI-DSS compliant checkout and never reach our servers. Credits are granted only after a cryptographically signed confirmation from Cashfree has been checked against Cashfree&rsquo;s own record of the order and the exact amount.</P>
    <H>Honest status</H>
    <P>{LEGAL.brand} is not yet independently certified (for example SOC 2 or ISO 27001). For enterprise deployments we can provide our security questionnaire responses, a data processing agreement, and single sign-on on request.</P>
    <H>Responsible disclosure</H>
    <P>If you believe you have found a vulnerability, email <Mail /> with details. Please do not access other users&rsquo; data or disrupt the service. We will acknowledge within 3 working days and keep you updated.</P>
  </>),

  contact: (<>
    <P>{LEGAL.operator}<br />{LEGAL.address}</P>
    <P>Support, billing and privacy requests: <Mail /></P>
    <H>Grievance Officer</H>
    <P>In line with the Information Technology Act, 2000, its rules and the DPDP Act, 2023, our Grievance Officer is <b>{LEGAL.grievanceOfficer}</b>, reachable at <Mail />. We acknowledge complaints within 48 hours and resolve them within 30 days. If you are not satisfied, you may approach the Data Protection Board of India.</P>
  </>),
};
