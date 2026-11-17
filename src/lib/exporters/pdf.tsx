import { Document, Font, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer";
import type { Block, DocModel } from "./model";

const C = { ink: "#1c1b19", ink2: "#4c4a45", ink3: "#85827a", paper: "#fbfaf7", line: "#e4ded2", band: "#f3efe6", amber: "#b57425", amberSoft: "#e8b86d", sage: "#2f7a63", warn: "#a8641a", night: "#0d0e12", nightInk: "#ecebe6" };

let registered = "";
function registerFonts(base: string) {
  if (registered === base) return;
  Font.register({ family: "Serif", fonts: [
    { src: `${base}/source-serif-4-latin-400-normal.woff` },
    { src: `${base}/source-serif-4-latin-400-italic.woff`, fontStyle: "italic" },
    { src: `${base}/source-serif-4-latin-600-normal.woff`, fontWeight: 600 },
  ] });
  Font.register({ family: "Sans", fonts: [
    { src: `${base}/inter-latin-400-normal.woff` },
    { src: `${base}/inter-latin-500-normal.woff`, fontWeight: 500 },
    { src: `${base}/inter-latin-600-normal.woff`, fontWeight: 600 },
  ] });
  Font.registerHyphenationCallback((w) => [w]);
  registered = base;
}

const s = StyleSheet.create({
  cover: { backgroundColor: C.night, color: C.nightInk, padding: 56, fontFamily: "Sans", justifyContent: "space-between" },
  brand: { flexDirection: "row", alignItems: "center" },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.amberSoft, marginRight: 10 },
  brandText: { fontSize: 10, letterSpacing: 4, fontWeight: 600 },
  coverKicker: { fontSize: 9, letterSpacing: 3, color: C.amberSoft, marginBottom: 14 },
  coverTitle: { fontFamily: "Serif", fontSize: 38, lineHeight: 1.12, marginBottom: 22 },
  coverQuote: { fontFamily: "Serif", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: "#b4b3ad", borderLeftWidth: 2, borderLeftColor: C.amberSoft, paddingLeft: 14 },
  statsRow: { flexDirection: "row", marginTop: 36 },
  stat: { marginRight: 36 },
  statVal: { fontFamily: "Serif", fontSize: 26, color: C.amberSoft },
  statLbl: { fontSize: 8, letterSpacing: 1.5, color: "#7d7d85", marginTop: 2 },
  coverFoot: { fontSize: 8.5, color: "#7d7d85", lineHeight: 1.5 },
  tocItem: { flexDirection: "row", justifyContent: "space-between", fontSize: 9.5, color: "#b4b3ad", paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: "#2a2e3a" },

  page: { backgroundColor: C.paper, color: C.ink, paddingTop: 64, paddingBottom: 60, paddingHorizontal: 56, fontFamily: "Sans", fontSize: 9.6, lineHeight: 1.55 },
  header: { position: "absolute", top: 26, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.ink3, letterSpacing: 1.2, borderBottomWidth: 0.5, borderBottomColor: C.line, paddingBottom: 6 },
  footer: { position: "absolute", bottom: 26, left: 56, right: 56, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.ink3 },
  kicker: { fontSize: 8, letterSpacing: 2.6, color: C.amber, fontWeight: 600, marginBottom: 8 },
  h1: { fontFamily: "Serif", fontSize: 26, lineHeight: 1.15, marginBottom: 6 },
  rule: { width: 44, height: 1.5, backgroundColor: C.amber, marginBottom: 18, marginTop: 6 },
  h3: { fontFamily: "Serif", fontSize: 13.5, fontWeight: 600, marginTop: 14, marginBottom: 6 },
  lead: { fontFamily: "Serif", fontSize: 13, lineHeight: 1.5, color: C.ink, marginBottom: 12 },
  p: { color: C.ink2, marginBottom: 8 },
  bulletRow: { flexDirection: "row", marginBottom: 4 },
  bulletDot: { width: 12, color: C.amber },
  bulletText: { flex: 1, color: C.ink2 },
  kvRow: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line, paddingVertical: 5 },
  kvKey: { width: "28%", fontSize: 8, letterSpacing: 0.8, color: C.ink3, fontWeight: 500, paddingRight: 8, paddingTop: 1 },
  kvVal: { flex: 1, color: C.ink },
  table: { borderWidth: 0.5, borderColor: C.line, marginVertical: 8 },
  tr: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.line },
  th: { backgroundColor: C.band, fontSize: 7.8, fontWeight: 600, color: C.ink2, letterSpacing: 0.6, padding: 5 },
  td: { fontSize: 8.6, color: C.ink, padding: 5, lineHeight: 1.4 },
  callout: { borderLeftWidth: 2.5, paddingVertical: 8, paddingHorizontal: 12, marginVertical: 10, fontSize: 9, lineHeight: 1.5 },
  quote: { fontFamily: "Serif", fontStyle: "italic", fontSize: 14, lineHeight: 1.5, color: C.ink, borderLeftWidth: 2, borderLeftColor: C.amber, paddingLeft: 14, marginBottom: 14 },
});

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "lead": return <Text style={s.lead}>{b.text}</Text>;
    case "p": return <Text style={s.p}>{b.text}</Text>;
    case "h3": return <Text style={s.h3} minPresenceAhead={90}>{b.text}</Text>;
    case "quote": return <Text style={s.quote}>{b.text}</Text>;
    case "bullets": return <View style={{ marginBottom: 6 }}>{b.items.map((x, i) => {
      const lead = x.match(/^\s*/)?.[0].length ?? 0;
      return <View key={i} style={[s.bulletRow, { paddingLeft: Math.min(lead, 16) * 3 }]} wrap={false}><Text style={s.bulletDot}>{lead ? "–" : "•"}</Text><Text style={s.bulletText}>{x.trim()}</Text></View>;
    })}</View>;
    case "kv": return <View style={{ marginBottom: 10 }}>{b.rows.map(([k, v], i) => <View key={i} style={s.kvRow} wrap={false}><Text style={s.kvKey}>{k.toUpperCase()}</Text><Text style={s.kvVal}>{v}</Text></View>)}</View>;
    case "callout": {
      const tone = b.tone === "warn" ? C.warn : b.tone === "sage" ? C.sage : C.amber;
      return <View style={[s.callout, { borderLeftColor: tone, backgroundColor: C.band }]} wrap={false}><Text style={{ color: C.ink2 }}>{b.text}</Text></View>;
    }
    case "table": {
      const w = b.widths ?? b.head.map(() => 100 / b.head.length);
      return (
        <View style={s.table}>
          <View style={s.tr} wrap={false} minPresenceAhead={40}>{b.head.map((h, i) => <Text key={i} style={[s.th, { width: `${w[i]}%` }]}>{h.toUpperCase()}</Text>)}</View>
          {b.rows.map((r, ri) => (
            <View key={ri} style={[s.tr, ri % 2 ? { backgroundColor: "#f8f5ee" } : {}]} wrap={false}>
              {r.map((c, i) => <Text key={i} style={[s.td, { width: `${w[i]}%` }, i === 0 ? { fontWeight: 500 } : {}]}>{c}</Text>)}
            </View>
          ))}
        </View>
      );
    }
  }
}

export function PdfDoc({ doc }: { doc: DocModel }) {
  return (
    <Document title={doc.title} author="NEXUS" creator="NEXUS" producer="NEXUS" subject={doc.thought}>
      <Page size="A4" style={s.cover}>
        <View style={s.brand}><View style={s.dot} /><Text style={s.brandText}>NEXUS</Text></View>
        <View>
          <Text style={s.coverKicker}>FROM THOUGHT TO EXECUTION</Text>
          <Text style={s.coverTitle}>{doc.title}</Text>
          <Text style={s.coverQuote}>{"“"}{doc.thought}{"”"}</Text>
          <View style={s.statsRow}>{doc.stats.map((x) => <View key={x.label} style={s.stat}><Text style={s.statVal}>{x.value}</Text><Text style={s.statLbl}>{x.label.toUpperCase()}</Text></View>)}</View>
        </View>
        <View>
          <View style={{ marginBottom: 26 }}>{doc.sections.map((x) => <View key={x.id} style={s.tocItem}><Text>{x.kicker.split(" · ")[1]}</Text><Text style={{ color: "#7d7d85" }}>{x.kicker.split(" · ")[0]}</Text></View>)}</View>
          <Text style={s.coverFoot}>{doc.date}{"\n"}{doc.aiNote}</Text>
        </View>
      </Page>
      {doc.sections.map((sec) => (
        <Page key={sec.id} size="A4" style={s.page} wrap>
          <View style={s.header} fixed><Text>NEXUS</Text><Text>{doc.title.toUpperCase().slice(0, 70)}</Text></View>
          <Text style={s.kicker}>{sec.kicker.toUpperCase()}</Text>
          <Text style={s.h1}>{sec.title}</Text>
          <View style={s.rule} />
          {sec.blocks.map((b, i) => <BlockView key={i} b={b} />)}
          <View style={s.footer} fixed><Text>{doc.date}</Text><Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} /></View>
        </Page>
      ))}
    </Document>
  );
}

export async function renderPdf(doc: DocModel, fontBase = typeof window !== "undefined" ? `${window.location.origin}/fonts` : "/fonts"): Promise<Blob> {
  registerFonts(fontBase);
  return pdf(<PdfDoc doc={doc} />).toBlob();
}
