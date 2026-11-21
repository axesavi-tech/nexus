import { describe, it, expect } from "vitest";
import { runOp } from "@/lib/ai/gateway";
import { COUNTRIES } from "@/lib/countries";
import { CURATED_COUNTRIES, curatedGuide, filterLinks, genericGuide, toGuide, OFFICIAL } from "@/lib/setup";
import { CountryGuideSchema, type CountryGuide } from "@/lib/schemas";

describe("country coverage", () => {
  it("lists every ISO 3166 country and territory", () => {
    expect(COUNTRIES.length).toBeGreaterThanOrEqual(249);
    expect(new Set(COUNTRIES.map((c) => c.code)).size).toBe(COUNTRIES.length);
  });
  it("curated guides are schema-valid and every link is an official https portal", () => {
    for (const code of CURATED_COUNTRIES) {
      const g = CountryGuideSchema.parse(curatedGuide(code));
      const official = new Set(OFFICIAL[code].map((o) => o.url));
      for (const s of g.steps) for (const l of s.links) { expect(official.has(l.url)).toBe(true); expect(l.url.startsWith("https://")).toBe(true); }
      expect(g.steps.some((s) => s.category === "formation")).toBe(true);
    }
  });
  it("uncurated countries get a link-free generic checklist offline", async () => {
    const g = (await runOp("country_guide", { countryCode: "KE", idea: "online saree store", businessType: "business", stage: "idea" })).data as CountryGuide;
    expect(g.mode).toBe("dev");
    expect(g.country).toBe("Kenya");
    expect(g.steps.every((s) => s.links.length === 0)).toBe(true);
    expect(CountryGuideSchema.safeParse(genericGuide("Kenya")).success).toBe(true);
  });
  it("curated countries come back labelled curated", async () => {
    const g = (await runOp("country_guide", { countryCode: "IN", idea: "Premium handloom sarees online", businessType: "D2C retail", stage: "customers" })).data as CountryGuide;
    expect(g.mode).toBe("curated");
    expect(g.recommendedForm.form).toMatch(/Private Limited/);
    expect(g.steps.find((s) => s.title.includes("SPICe+"))!.links[0].url).toBe("https://www.mca.gov.in");
  });
});

describe("link integrity for live research", () => {
  const ai = {
    ...curatedGuide("GB")!,
    steps: [{
      category: "formation" as const, title: "Register", what: "", documents: [], authority: "Companies House", timeEstimate: "", costEstimate: "", mandatory: true,
      links: [
        { title: "Retrieved page", url: "https://www.gov.uk/limited-company-formation/register-your-company" },
        { title: "Invented page", url: "https://www.gov.uk/made-up-page-that-was-never-searched" },
        { title: "Official portal", url: "https://www.gov.uk/register-for-vat" },
        { title: "Insecure", url: "http://example.com" },
      ],
    }, ...curatedGuide("GB")!.steps.slice(1)],
  };
  it("keeps only links the research actually retrieved or curated official portals", () => {
    const { steps, removed } = filterLinks(ai, "GB", [{ title: "x", url: "https://www.gov.uk/limited-company-formation/register-your-company/" }]);
    expect(steps[0].links.map((l) => [l.title, l.source])).toEqual([["Retrieved page", "search"], ["Official portal", "official"]]);
    expect(removed).toBe(2);
  });
  it("records retrieved sources and the number of removed links", () => {
    const g = toGuide(ai, "GB", [{ title: "Gov page", url: "https://www.gov.uk/limited-company-formation/register-your-company" }], "live");
    expect(g.sources).toHaveLength(1);
    expect(g.removedLinks).toBeGreaterThanOrEqual(2);
    expect(g.steps.every((s) => /^s\d+$/.test(s.id))).toBe(true);
  });
});
