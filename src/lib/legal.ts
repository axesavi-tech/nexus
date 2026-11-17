/** Business details shown in policies, footer and invoices. Set the NEXT_PUBLIC_* variables in Vercel. */
export const LEGAL = {
  brand: "NEXUS",
  operator: process.env.NEXT_PUBLIC_LEGAL_NAME || "Abhijit (sole proprietor), trading as NEXUS",
  address: process.env.NEXT_PUBLIC_LEGAL_ADDRESS || "Pune, Maharashtra, India",
  email: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@nexus.example",
  grievanceOfficer: process.env.NEXT_PUBLIC_GRIEVANCE_OFFICER || "Abhijit",
  effective: "17 November 2026",
  jurisdiction: "Pune, Maharashtra",
};

export const POLICIES = [
  { slug: "privacy", title: "Privacy Policy" },
  { slug: "terms", title: "Terms of Service" },
  { slug: "data", title: "Data Processing & Retention Policy" },
  { slug: "refunds", title: "Refund, Cancellation & Delivery Policy" },
  { slug: "cookies", title: "Cookie Policy" },
  { slug: "acceptable-use", title: "Acceptable Use Policy" },
  { slug: "security", title: "Security" },
  { slug: "contact", title: "Contact & Grievance Redressal" },
] as const;
export type PolicySlug = (typeof POLICIES)[number]["slug"];
