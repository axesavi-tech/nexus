/**
 * Company-setup guide helpers.
 *
 * Trust model for links:
 *  - Live guides are researched with Claude's web-search tool. A link the model returns is kept only if its exact URL
 *    was among the pages the search actually retrieved, or it is one of the curated official portals below.
 *    Anything else is dropped and counted — the model cannot invent a government URL.
 *  - The app then checks every kept link from the server and shows whether it opens.
 *  - Curated entries are official portal home pages only (stable addresses), never deep links.
 */
import type { CountryGuide, CountryGuideAI, SetupCategory, SetupLink, SetupStep } from "./schemas";
import { countryByCode } from "./countries";

export const CATEGORY_LABEL: Record<SetupCategory, string> = {
  structure: "Choose your legal structure", formation: "Register the company", tax: "Tax registration", banking: "Banking & payments",
  licences: "Licences & permits", employment: "Hiring & payroll", ip: "Brand & intellectual property", data: "Data protection & consumer law",
  sector: "Sector-specific rules", ongoing: "Ongoing compliance",
};
export const CATEGORY_ORDER = Object.keys(CATEGORY_LABEL) as SetupCategory[];

/** Official portals (home pages) by country. */
export const OFFICIAL: Record<string, { title: string; url: string }[]> = {
  IN: [
    { title: "Ministry of Corporate Affairs (company & LLP registration)", url: "https://www.mca.gov.in" },
    { title: "GST portal", url: "https://www.gst.gov.in" },
    { title: "Income Tax Department e-filing", url: "https://www.incometax.gov.in" },
    { title: "Startup India (DPIIT recognition)", url: "https://www.startupindia.gov.in" },
    { title: "Udyam (MSME) registration", url: "https://udyamregistration.gov.in" },
    { title: "Employees' Provident Fund Organisation", url: "https://www.epfindia.gov.in" },
    { title: "Employees' State Insurance Corporation", url: "https://www.esic.gov.in" },
    { title: "Intellectual Property India (trademarks)", url: "https://ipindia.gov.in" },
  ],
  GB: [
    { title: "GOV.UK — set up a limited company", url: "https://www.gov.uk/limited-company-formation" },
    { title: "Companies House", url: "https://www.gov.uk/government/organisations/companies-house" },
    { title: "GOV.UK — register for VAT", url: "https://www.gov.uk/register-for-vat" },
    { title: "GOV.UK — register as an employer", url: "https://www.gov.uk/register-employer" },
    { title: "Information Commissioner's Office (data protection)", url: "https://ico.org.uk" },
    { title: "UK Intellectual Property Office", url: "https://www.gov.uk/government/organisations/intellectual-property-office" },
  ],
  US: [
    { title: "U.S. Small Business Administration — business guide", url: "https://www.sba.gov/business-guide" },
    { title: "Internal Revenue Service (EIN, federal tax)", url: "https://www.irs.gov" },
    { title: "U.S. Patent and Trademark Office", url: "https://www.uspto.gov" },
    { title: "FinCEN (beneficial ownership information)", url: "https://www.fincen.gov" },
  ],
  SG: [
    { title: "ACRA — Accounting and Corporate Regulatory Authority", url: "https://www.acra.gov.sg" },
    { title: "Bizfile — company registration", url: "https://www.bizfile.gov.sg" },
    { title: "IRAS — tax and GST", url: "https://www.iras.gov.sg" },
    { title: "GoBusiness — licences", url: "https://www.gobusiness.gov.sg" },
    { title: "CPF Board (employer contributions)", url: "https://www.cpf.gov.sg" },
    { title: "PDPC — personal data protection", url: "https://www.pdpc.gov.sg" },
  ],
  AE: [
    { title: "UAE government portal — business", url: "https://u.ae/en/information-and-services/business" },
    { title: "Federal Tax Authority (corporate tax, VAT)", url: "https://tax.gov.ae" },
  ],
  AU: [
    { title: "business.gov.au", url: "https://business.gov.au" },
    { title: "Australian Business Register (ABN)", url: "https://www.abr.gov.au" },
    { title: "ASIC — company registration", url: "https://asic.gov.au" },
    { title: "Australian Taxation Office", url: "https://www.ato.gov.au" },
  ],
  CA: [
    { title: "Government of Canada — starting a business", url: "https://www.canada.ca/en/services/business/start.html" },
    { title: "Corporations Canada (federal incorporation)", url: "https://ised-isde.canada.ca/site/corporations-canada/en" },
    { title: "Canada Revenue Agency", url: "https://www.canada.ca/en/revenue-agency.html" },
  ],
};
export const officialHosts = (code: string) => new Set((OFFICIAL[code] ?? []).map((o) => new URL(o.url).hostname));

const norm = (u: string) => { try { const x = new URL(u); x.hash = ""; return x.toString().replace(/\/$/, "").toLowerCase(); } catch { return ""; } };

/** Keep only links that the research retrieved (exact URL) or that are curated official portals. */
export function filterLinks(ai: CountryGuideAI, countryCode: string, retrieved: { title: string; url: string }[]): { steps: SetupStep[]; removed: number } {
  const seen = new Set(retrieved.map((r) => norm(r.url)).filter(Boolean));
  const official = new Map((OFFICIAL[countryCode] ?? []).map((o) => [norm(o.url), o]));
  let removed = 0;
  const steps = ai.steps.map((s, i) => {
    const links: SetupLink[] = [];
    for (const l of s.links) {
      const n = norm(l.url);
      if (!n || !/^https:\/\//i.test(l.url)) { removed++; continue; }
      if (official.has(n)) links.push({ title: l.title, url: l.url, source: "official" });
      else if (seen.has(n)) links.push({ title: l.title, url: l.url, source: "search" });
      else removed++;
    }
    return { ...s, id: `s${i + 1}`, links };
  });
  return { steps, removed };
}

export function toGuide(ai: CountryGuideAI, countryCode: string, retrieved: { title: string; url: string }[], mode: CountryGuide["mode"]): CountryGuide {
  const { steps, removed } = filterLinks(ai, countryCode, retrieved);
  const uniq = new Map(retrieved.filter((r) => /^https:\/\//i.test(r.url)).map((r) => [norm(r.url), r]));
  return { ...ai, steps, countryCode, country: countryByCode(countryCode)?.name ?? countryCode, sources: [...uniq.values()].slice(0, 40), removedLinks: removed, generatedAt: new Date().toISOString(), mode };
}

// ---------------- Curated offline baselines (used without an AI key, and as a fallback) ----------------
type Step = CountryGuideAI["steps"][number];
const st = (category: SetupCategory, title: string, what: string, documents: string[], authority: string, timeEstimate: string, costEstimate: string, mandatory: boolean, links: number[] = [], code = ""): Step & { _l: number[]; _c: string } =>
  ({ category, title, what, documents, authority, timeEstimate, costEstimate, mandatory, links: [], _l: links, _c: code });

const BASE: Record<string, { summary: string; form: CountryGuideAI["recommendedForm"]; steps: ReturnType<typeof st>[]; ongoing: CountryGuideAI["ongoing"] }> = {
  IN: {
    summary: "Most product startups in India incorporate a Private Limited Company through the MCA's integrated SPICe+ form, which also issues PAN and TAN. GST, Startup India recognition and state-level registrations follow depending on what you sell and where.",
    form: { form: "Private Limited Company", why: "Separate legal entity, limited liability, can raise equity and issue ESOPs — the usual choice for startups planning to grow or raise funding.", alternatives: [{ form: "Limited Liability Partnership (LLP)", when: "Professional or bootstrapped businesses with partners and no plan to raise equity." }, { form: "One Person Company (OPC)", when: "A solo founder wanting limited liability; has turnover and conversion rules." }, { form: "Sole proprietorship", when: "Testing an idea at very small scale; no liability protection." }] },
    steps: [
      st("structure", "Decide the legal structure and founders' shareholding", "Agree who the directors and shareholders are and how equity is split before filing — it is costly to change later.", ["Founders' agreement (recommended)", "Proposed company names (2–3 options)"], "—", "1–3 days", "—", true),
      st("formation", "Get Digital Signature Certificates (DSC) for directors", "Every proposed director needs a Class 3 DSC to sign the incorporation e-forms.", ["PAN card", "Aadhaar or passport", "Photograph", "Email and mobile"], "Licensed certifying authorities", "1–2 days", "Varies by provider", true),
      st("formation", "Incorporate through SPICe+ on the MCA portal", "One integrated filing covers name reservation, incorporation, DIN, PAN, TAN, and optionally GSTIN, EPFO and ESIC registration and a bank account.", ["Directors' identity and address proof", "Registered office proof (rent agreement or utility bill) and owner's NOC", "Memorandum and Articles of Association (e-MoA, e-AoA)", "Subscriber declarations"], "Ministry of Corporate Affairs / Registrar of Companies", "1–3 weeks", "Government fees depend on authorised capital and state stamp duty", true, [0]),
      st("tax", "Register for GST if required", "Mandatory above the turnover threshold (generally ₹40 lakh for goods and ₹20 lakh for services in most states), for inter-state supplies of goods, and in many e-commerce cases. Confirm current rules for your situation.", ["Certificate of Incorporation", "Company PAN", "Registered office proof", "Bank details", "Authorised signatory details"], "GST Network", "1–2 weeks", "No government fee", false, [1]),
      st("tax", "Set up income-tax compliance", "The company's PAN and TAN are issued at incorporation; register on the e-filing portal and set up TDS processes.", ["Company PAN and TAN"], "Income Tax Department", "1 day", "—", true, [2]),
      st("licences", "Apply for DPIIT Startup India recognition (optional)", "Recognition can unlock tax and compliance benefits for eligible startups.", ["Certificate of Incorporation", "Description of innovation", "Website or pitch deck"], "DPIIT", "2–4 weeks", "No fee", false, [3]),
      st("licences", "Register on Udyam as an MSME (optional)", "Gives access to MSME schemes and delayed-payment protections.", ["Company PAN", "GSTIN (if registered)", "Director's Aadhaar"], "Ministry of MSME", "1 day", "No fee", false, [4]),
      st("licences", "Get the state Shops & Establishments registration", "Most states require it for an office or premises within a set period of starting; the rules and portal differ by state.", ["Premises proof", "Employer details"], "State Labour Department", "1–2 weeks", "Small state fee", true),
      st("banking", "Open a current account in the company's name", "Needed for capital infusion, receiving payments and paying suppliers.", ["Certificate of Incorporation", "Company PAN", "MoA and AoA", "Board resolution", "Directors' KYC"], "Your chosen bank", "1–2 weeks", "Minimum balance varies", true),
      st("employment", "Register for EPF and ESIC when thresholds apply", "EPF generally applies at 20+ employees and ESIC at 10+ (thresholds can vary); professional tax is state-specific.", ["Company registration", "Employee details"], "EPFO / ESIC / State", "1–2 weeks", "Contributions as % of wages", false, [5, 6]),
      st("ip", "File a trademark for your brand name and logo", "Protects the brand; filing early is cheaper than a later dispute.", ["Logo and brand name", "Class of goods or services", "Proof of use (if any)"], "Controller General of Patents, Designs & Trade Marks", "Filing in days; registration can take months", "Official fee depends on applicant type", false, [7]),
      st("data", "Plan for the Digital Personal Data Protection Act, 2023", "If you collect customers' personal data, set up consent, notice and security practices as the rules come into force.", ["Privacy notice", "Consent records"], "Ministry of Electronics & IT", "Ongoing", "—", false),
    ],
    ongoing: [
      { obligation: "Annual financial statements and annual return to the Registrar (e.g. AOC-4, MGT-7)", frequency: "Yearly", authority: "Registrar of Companies" },
      { obligation: "Statutory audit by a chartered accountant", frequency: "Yearly", authority: "—" },
      { obligation: "Income-tax return and TDS returns", frequency: "Yearly / quarterly", authority: "Income Tax Department" },
      { obligation: "GST returns (if registered)", frequency: "Monthly or quarterly", authority: "GSTN" },
      { obligation: "Board meetings and statutory registers", frequency: "Per the Companies Act", authority: "—" },
    ],
  },
  GB: {
    summary: "Most UK startups register a private company limited by shares with Companies House online, then register for Corporation Tax, and for VAT and PAYE when they apply.",
    form: { form: "Private company limited by shares (Ltd)", why: "Limited liability, easy to set up online, and suits raising investment and issuing options.", alternatives: [{ form: "Sole trader", when: "Very small, low-risk trading; no separate legal entity." }, { form: "Limited Liability Partnership (LLP)", when: "Professional partnerships." }] },
    steps: [
      st("structure", "Choose a company name, directors and shareholders", "Check the name is available, then decide directors, shareholders and people with significant control (PSC).", ["Proposed name", "Director and shareholder details", "SIC code for your activity"], "—", "1 day", "—", true, [0]),
      st("formation", "Register the company with Companies House", "Register online with your registered office address, articles of association and share structure; identity verification now applies to directors and PSCs.", ["Registered office address in the UK", "Articles of association (model articles are fine)", "Statement of capital", "Director and PSC details"], "Companies House", "Usually within 24–48 hours online", "Registration fee (check the current fee)", true, [0, 1]),
      st("tax", "Register for Corporation Tax", "Required within 3 months of starting to do business.", ["Company registration number", "Unique Taxpayer Reference (sent after incorporation)"], "HM Revenue & Customs", "Days", "No fee", true, [0]),
      st("tax", "Register for VAT when required", "Mandatory once VAT-taxable turnover passes £90,000 in a 12-month period; voluntary registration is possible below that.", ["Company details", "Bank details", "Turnover figures"], "HM Revenue & Customs", "Up to several weeks", "No fee", false, [2]),
      st("banking", "Open a business bank account", "Keeps company and personal money separate — required in practice for a limited company.", ["Certificate of incorporation", "Directors' ID", "Proof of address"], "Your chosen bank", "Days to weeks", "Varies", true),
      st("employment", "Register as an employer for PAYE", "Before the first payday, including if a director is paid a salary; workplace pension auto-enrolment duties also apply.", ["Company details", "Employee details"], "HM Revenue & Customs", "Up to 5 working days", "No fee", false, [3]),
      st("data", "Pay the data protection fee and set up privacy compliance", "Most organisations processing personal data must pay the ICO fee and comply with UK GDPR.", ["Privacy notice", "Record of processing"], "Information Commissioner's Office", "1 day", "Annual fee by organisation size", true, [4]),
      st("ip", "Register your trade mark", "Protect your brand name and logo in the UK.", ["Mark", "Classes of goods/services"], "UK Intellectual Property Office", "About 4 months to registration", "Fee per class", false, [5]),
    ],
    ongoing: [
      { obligation: "Confirmation statement", frequency: "At least yearly", authority: "Companies House" },
      { obligation: "Annual accounts", frequency: "Yearly", authority: "Companies House / HMRC" },
      { obligation: "Company Tax Return (CT600)", frequency: "Yearly", authority: "HMRC" },
      { obligation: "VAT returns (if registered)", frequency: "Usually quarterly", authority: "HMRC" },
    ],
  },
  US: {
    summary: "Company formation in the US happens at state level. Founders planning to raise venture capital commonly form a Delaware C-Corporation; smaller businesses often form an LLC in their home state. Federal tax ID (EIN) comes from the IRS.",
    form: { form: "Delaware C-Corporation (if raising VC) or a state LLC", why: "C-Corps suit equity investment and stock options; LLCs are simpler and pass profits through for tax.", alternatives: [{ form: "LLC in your home state", when: "Bootstrapped or lifestyle businesses." }, { form: "S-Corporation election", when: "Small US-owned businesses wanting pass-through taxation with salaries — eligibility limits apply." }] },
    steps: [
      st("structure", "Choose entity type and state of formation", "Decide between LLC and corporation and where to form; you may also need to register (foreign qualify) in the state where you operate.", ["Founders' details", "Proposed name"], "—", "Days", "—", true, [0]),
      st("formation", "File formation documents with the Secretary of State", "File Articles of Organization (LLC) or Certificate of Incorporation (corporation) and appoint a registered agent in that state.", ["Formation document", "Registered agent details"], "State Secretary of State", "Days to weeks", "State filing fee varies", true, [0]),
      st("tax", "Get an Employer Identification Number (EIN)", "Free federal tax ID used for banking, taxes and hiring.", ["Formation document", "Responsible party details"], "Internal Revenue Service", "Often same day online", "Free", true, [1]),
      st("tax", "Register for state and local taxes", "Sales tax permits, state income/franchise tax and local business licences depend on the state and city.", ["EIN", "Formation documents"], "State revenue department / city", "Days to weeks", "Varies", true, [0]),
      st("formation", "Check beneficial ownership (BOI) reporting rules", "FinCEN's reporting requirements changed in 2025; confirm whether they apply to your company.", [], "FinCEN", "—", "—", false, [3]),
      st("banking", "Open a business bank account", "Use the EIN and formation documents to open an account in the company's name.", ["EIN confirmation", "Formation documents", "Owners' ID"], "Your chosen bank", "Days", "Varies", true),
      st("employment", "Set up payroll and employer registrations", "Federal and state withholding, unemployment insurance and workers' compensation before hiring.", ["EIN", "State employer registration"], "IRS / state agencies", "Weeks", "Varies", false, [1]),
      st("ip", "Register trademarks", "Protect the brand federally.", ["Mark", "Goods/services description"], "USPTO", "Months", "Fee per class", false, [2]),
    ],
    ongoing: [
      { obligation: "State annual report / franchise tax", frequency: "Yearly", authority: "State" },
      { obligation: "Federal income tax return", frequency: "Yearly", authority: "IRS" },
      { obligation: "Sales tax returns (if registered)", frequency: "Monthly to yearly", authority: "State" },
    ],
  },
  SG: {
    summary: "Startups in Singapore usually incorporate a private company limited by shares (Pte. Ltd.) through Bizfile with ACRA. At least one director must be ordinarily resident in Singapore.",
    form: { form: "Private company limited by shares (Pte. Ltd.)", why: "Separate legal entity, limited liability, and widely used for regional startups.", alternatives: [{ form: "Sole proprietorship", when: "Simple local trading by one person." }, { form: "Limited Liability Partnership", when: "Professional partnerships." }] },
    steps: [
      st("formation", "Reserve a name and incorporate via Bizfile", "Register with ACRA online; you need a Singapore registered office address and at least one locally resident director.", ["Company constitution", "Director and shareholder details", "Registered office address"], "ACRA", "Often within a day", "Name application and incorporation fees", true, [0, 1]),
      st("formation", "Appoint a company secretary", "Required within 6 months of incorporation.", ["Secretary details"], "ACRA", "—", "Service fees if outsourced", true, [0]),
      st("tax", "Register for GST when required", "Compulsory if taxable turnover exceeds S$1 million in a 12-month period (or is expected to).", ["Company details", "Turnover forecast"], "IRAS", "Weeks", "No fee", false, [2]),
      st("licences", "Check licences for your activity", "Some activities need licences from specific agencies.", [], "GoBusiness", "Varies", "Varies", false, [3]),
      st("banking", "Open a corporate bank account", "", ["Business profile", "Constitution", "Directors' ID", "Board resolution"], "Your chosen bank", "Days to weeks", "Varies", true),
      st("employment", "Set up CPF contributions for employees", "Mandatory for Singapore citizen and permanent resident employees.", ["Employee details"], "CPF Board", "—", "Contributions as % of wages", false, [4]),
      st("data", "Comply with the PDPA", "Appoint a data protection officer and set up data policies if you handle personal data.", ["Privacy policy"], "PDPC", "Ongoing", "—", true, [5]),
    ],
    ongoing: [
      { obligation: "Annual return", frequency: "Yearly", authority: "ACRA" },
      { obligation: "Corporate income tax filing", frequency: "Yearly", authority: "IRAS" },
    ],
  },
  AE: {
    summary: "In the UAE you choose between a mainland licence (trade anywhere in the UAE) and a free-zone company (simpler setup, activity and location limits). Corporate tax registration with the Federal Tax Authority applies to UAE businesses.",
    form: { form: "Free-zone LLC or mainland LLC", why: "Free zones are quick to set up; mainland suits trading directly with the local market.", alternatives: [{ form: "Branch of a foreign company", when: "An existing overseas company expanding to the UAE." }] },
    steps: [
      st("structure", "Choose mainland or free zone and your business activity", "The licence type and activity list decide what you may do and where.", ["Business plan", "Shareholder passports"], "Department of Economy (emirate) or free-zone authority", "Days", "Varies widely", true, [0]),
      st("formation", "Obtain the trade licence and register the company", "Reserve a trade name, get initial approval, sign the lease or flexi-desk, and receive the licence.", ["Passports and visas", "Memorandum of association", "Tenancy contract / Ejari"], "Licensing authority", "1–4 weeks", "Licence and registration fees vary", true, [0]),
      st("tax", "Register for Corporate Tax", "UAE corporate tax applies; registration is required within set deadlines.", ["Trade licence", "Passport and Emirates ID of owners"], "Federal Tax Authority", "Weeks", "No registration fee", true, [1]),
      st("tax", "Register for VAT when required", "Mandatory above AED 375,000 of taxable supplies in 12 months.", ["Trade licence", "Turnover records"], "Federal Tax Authority", "Weeks", "No fee", false, [1]),
      st("banking", "Open a corporate bank account", "Banks perform detailed KYC; prepare a business plan and source-of-funds evidence.", ["Trade licence", "MoA", "Shareholders' passports and visas"], "Your chosen bank", "Weeks", "Minimum balance varies", true),
    ],
    ongoing: [
      { obligation: "Licence renewal", frequency: "Yearly", authority: "Licensing authority" },
      { obligation: "Corporate tax return", frequency: "Yearly", authority: "Federal Tax Authority" },
    ],
  },
  AU: {
    summary: "In Australia you register a proprietary company with ASIC, obtain an ABN and TFN, and register for GST once turnover reaches A$75,000.",
    form: { form: "Proprietary limited company (Pty Ltd)", why: "Limited liability and suits investment.", alternatives: [{ form: "Sole trader", when: "Simple low-risk trading." }] },
    steps: [
      st("formation", "Register the company with ASIC", "Get an Australian Company Number (ACN); you need a registered office and at least one Australian-resident director.", ["Company name", "Officeholder and shareholder details", "Registered office address"], "ASIC", "Usually same day", "Registration fee", true, [2]),
      st("tax", "Apply for an ABN and TFN", "Needed for invoicing and tax.", ["ACN", "Director details"], "Australian Business Register / ATO", "Days", "Free", true, [1, 3]),
      st("tax", "Register for GST when required", "Required at A$75,000 annual GST turnover.", ["ABN"], "ATO", "Days", "Free", false, [3]),
      st("banking", "Open a business bank account", "", ["ACN/ABN", "Directors' ID"], "Your chosen bank", "Days", "Varies", true),
      st("employment", "Set up PAYG withholding and superannuation", "Before hiring employees.", ["ABN"], "ATO", "Days", "—", false, [3]),
      st("licences", "Check licences and permits", "Use the business licence finder for your activity and location.", [], "business.gov.au", "Varies", "Varies", false, [0]),
    ],
    ongoing: [{ obligation: "Annual review fee and company details check", frequency: "Yearly", authority: "ASIC" }, { obligation: "Business activity statements (BAS)", frequency: "Monthly or quarterly", authority: "ATO" }],
  },
  CA: {
    summary: "In Canada you can incorporate federally or provincially, then obtain a Business Number from the CRA and register for GST/HST once revenue passes C$30,000.",
    form: { form: "Corporation (federal or provincial)", why: "Limited liability; federal incorporation protects the name across Canada.", alternatives: [{ form: "Sole proprietorship", when: "Small, low-risk trading." }] },
    steps: [
      st("formation", "Incorporate federally or provincially", "Federal incorporation through Corporations Canada, followed by extra-provincial registration where you operate.", ["Articles of incorporation", "Registered office address", "Directors' details"], "Corporations Canada / provincial registry", "Days", "Filing fee", true, [1]),
      st("tax", "Get a Business Number and tax accounts", "Used for corporate income tax, payroll and GST/HST.", ["Incorporation documents"], "Canada Revenue Agency", "Days", "Free", true, [2]),
      st("tax", "Register for GST/HST when required", "Required once taxable revenue exceeds C$30,000 over four consecutive quarters (small-supplier limit).", ["Business Number"], "Canada Revenue Agency", "Days", "Free", false, [2]),
      st("banking", "Open a business bank account", "", ["Certificate of incorporation", "Directors' ID"], "Your chosen bank", "Days", "Varies", true),
      st("licences", "Check provincial and municipal licences", "Requirements vary by province and city.", [], "Province / municipality", "Varies", "Varies", false, [0]),
    ],
    ongoing: [{ obligation: "Annual return", frequency: "Yearly", authority: "Corporations Canada / province" }, { obligation: "Corporate income tax return (T2)", frequency: "Yearly", authority: "CRA" }],
  },
};

export const CURATED_COUNTRIES = Object.keys(BASE);

/** A curated baseline guide, with each step's portal links resolved from OFFICIAL. */
export function curatedGuide(code: string): CountryGuideAI | null {
  const b = BASE[code];
  if (!b) return null;
  const portals = OFFICIAL[code] ?? [];
  return {
    summary: b.summary, recommendedForm: b.form, ongoing: b.ongoing,
    caveats: "Curated baseline from official portals; thresholds and fees change — confirm on the linked portal or with a qualified professional before acting.",
    steps: b.steps.map(({ _l, _c, ...s }) => { void _c; return { ...s, links: _l.map((i) => portals[i]).filter(Boolean) }; }),
  };
}

/** Generic, link-free checklist for countries without curated data and no live research available. */
export function genericGuide(countryName: string): CountryGuideAI {
  const g = (category: SetupCategory, title: string, what: string, mandatory = true): Step => ({ category, title, what, documents: [], authority: "Check the official government business portal", timeEstimate: "Varies", costEstimate: "Varies", mandatory, links: [] });
  return {
    summary: `A general checklist for setting up a company in ${countryName}. It is not country-specific — run live research for the actual requirements, authorities and official links.`,
    recommendedForm: { form: "Limited-liability company (local equivalent)", why: "Separates personal and business liability in most legal systems.", alternatives: [] },
    steps: [
      g("structure", "Choose the legal form", "Compare sole proprietorship, partnership and limited company forms available locally."),
      g("formation", "Register the business / incorporate", "Reserve a name and file incorporation documents with the company registry."),
      g("tax", "Register for corporate tax and any VAT/GST/sales tax", "Find thresholds and deadlines from the tax authority."),
      g("banking", "Open a business bank account", "Prepare incorporation documents and owners' identification."),
      g("licences", "Obtain licences and permits for your activity", "Check national, regional and municipal requirements."),
      g("employment", "Register as an employer before hiring", "Payroll tax, social security and pension obligations.", false),
      g("ip", "Protect your brand", "Register trademarks with the national IP office.", false),
      g("data", "Comply with data-protection and consumer law", "Privacy notices, consent and online-selling rules."),
    ],
    ongoing: [{ obligation: "Annual filings and tax returns", frequency: "Yearly", authority: "Company registry / tax authority" }],
    caveats: "Generic checklist only — no country-specific facts or links. Use live research.",
  };
}
