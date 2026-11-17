import PptxGenJS from "pptxgenjs";
import type { Block, DocModel } from "./model";

const BG = "0D0E12", PANEL = "171A21", LINE = "2A2E3A", INK = "ECEBE6", INK2 = "B4B3AD", INK3 = "7D7D85", AMBER = "E8B86D", SAGE = "7FB8A4";
const SERIF = "Georgia", SANS = "Calibri";
const W = 13.333, H = 7.5, M = 0.7;

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);

function chrome(slide: PptxGenJS.Slide, doc: DocModel, kicker: string, n: number) {
  slide.background = { color: BG };
  slide.addShape("ellipse", { x: M, y: 0.42, w: 0.12, h: 0.12, fill: { color: AMBER }, line: { color: AMBER } });
  slide.addText("NEXUS", { x: M + 0.22, y: 0.32, w: 2, h: 0.32, fontFace: SANS, fontSize: 10, bold: true, color: INK, charSpacing: 6 });
  slide.addText(kicker.toUpperCase(), { x: W - M - 6, y: 0.32, w: 6, h: 0.32, align: "right", fontFace: SANS, fontSize: 9, color: AMBER, charSpacing: 3 });
  slide.addText(`${clip(doc.title, 80)}   ·   ${n}`, { x: M, y: H - 0.55, w: W - 2 * M, h: 0.3, align: "right", fontFace: SANS, fontSize: 8, color: INK3 });
}

function title(slide: PptxGenJS.Slide, text: string) {
  slide.addText(clip(text, 72), { x: M, y: 0.85, w: W - 2 * M, h: 0.75, fontFace: SERIF, fontSize: 28, color: INK, valign: "middle" });
  slide.addShape("rect", { x: M, y: 1.72, w: 0.6, h: 0.03, fill: { color: AMBER }, line: { color: AMBER } });
}

type Unit = { kind: "statement" | "bullets" | "kv" | "table" | "pair"; title: string; left?: Unit; right?: Unit; lead?: string; notes?: string[]; text?: string; items?: string[]; rows?: string[][]; head?: string[]; widths?: number[]; tone?: string; quote?: boolean };

/** Put two short lists side by side so slides are full but never crowded. */
function pack(units: Unit[], sectionTitle: string): Unit[] {
  const out: Unit[] = [];
  const small = (u?: Unit) => u?.kind === "bullets" && u.items!.length <= 4 && u.items!.join("").length < 520;
  for (let i = 0; i < units.length; i++) {
    if (small(units[i]) && small(units[i + 1])) { out.push({ kind: "pair", title: sectionTitle, left: units[i], right: units[i + 1] }); i++; }
    else out.push(units[i]);
  }
  return out;
}

function toUnits(sectionTitle: string, blocks: Block[], maxBullets = Infinity): Unit[] {
  const U: Unit[] = [];
  let heading = sectionTitle;
  let para: string[] = [];
  const flush = () => { if (para.length) { U.push({ kind: "bullets", title: heading, items: para }); para = []; } };
  for (const b of blocks) {
    if (b.t === "h3") { flush(); heading = b.text; continue; }
    if (b.t === "p") { para.push(b.text); continue; }
    flush();
    if (b.t === "lead" || b.t === "quote") U.push({ kind: "statement", title: heading, text: b.text, quote: b.t === "quote" });
    else if (b.t === "callout") U.push({ kind: "statement", title: b.tone === "warn" ? "Caveats & open questions" : "Note", text: b.text, tone: b.tone === "warn" ? AMBER : b.tone === "sage" ? SAGE : AMBER });
    else if (b.t === "bullets" && U[U.length - 1]?.kind === "kv" && U[U.length - 1].title === heading && !U[U.length - 1].notes && b.items.length <= 4 && b.items.join(" ").length < 360) U[U.length - 1].notes = b.items;
    else if (b.t === "bullets") for (let i = 0; i < Math.min(b.items.length, maxBullets); i += 6) U.push({ kind: "bullets", title: heading + (i ? " (cont.)" : ""), items: b.items.slice(i, i + 6) });
    else if (b.t === "kv") {
      // Fold a short preceding paragraph into the slide as its lead line.
      const prev = U[U.length - 1];
      let lead: string | undefined;
      if (prev?.kind === "bullets" && prev.title === heading && prev.items!.length <= 2 && prev.items!.join(" ").length < 260) { lead = prev.items!.join(" "); U.pop(); }
      const per = lead ? 5 : 6;
      for (let i = 0; i < b.rows.length; i += per) U.push({ kind: "kv", title: heading, rows: b.rows.slice(i, i + per), lead: i ? undefined : lead });
    }
    else if (b.t === "table") for (let i = 0; i < b.rows.length; i += 7) U.push({ kind: "table", title: heading + (i ? " (cont.)" : ""), head: b.head, rows: b.rows.slice(i, i + 7), widths: b.widths });
  }
  flush();
  return pack(U, sectionTitle);
}

export async function renderPptx(doc: DocModel): Promise<Blob> {
  const p = new PptxGenJS();
  p.layout = "LAYOUT_WIDE";
  p.author = "NEXUS"; p.title = doc.title; p.subject = doc.thought;
  let n = 1;

  // Title
  const t = p.addSlide(); t.background = { color: BG };
  t.addShape("ellipse", { x: M, y: 0.6, w: 0.16, h: 0.16, fill: { color: AMBER }, line: { color: AMBER } });
  t.addText("NEXUS", { x: M + 0.28, y: 0.5, w: 3, h: 0.36, fontFace: SANS, fontSize: 12, bold: true, color: INK, charSpacing: 8 });
  t.addText("FROM THOUGHT TO EXECUTION", { x: M, y: 2.2, w: 8, h: 0.35, fontFace: SANS, fontSize: 11, color: AMBER, charSpacing: 4 });
  t.addText(clip(doc.title, 90), { x: M, y: 2.6, w: W - 2 * M, h: 1.5, fontFace: SERIF, fontSize: 46, color: INK, valign: "top", fit: "shrink" });
  t.addShape("rect", { x: M, y: 4.35, w: 0.04, h: 1.0, fill: { color: AMBER }, line: { color: AMBER } });
  t.addText(`“${clip(doc.thought, 260)}”`, { x: M + 0.25, y: 4.3, w: W - 2 * M - 0.25, h: 1.1, fontFace: SERIF, italic: true, fontSize: 18, color: INK2, valign: "middle", fit: "shrink" });
  t.addText(`${doc.date}   ·   ${doc.aiNote}`, { x: M, y: H - 0.8, w: W - 2 * M, h: 0.4, fontFace: SANS, fontSize: 9, color: INK3 });

  // Agenda
  const a = p.addSlide(); chrome(a, doc, "Contents", ++n); title(a, "What's inside");
  doc.sections.forEach((s, i) => {
    const col = i < 5 ? 0 : 1, row = i % 5;
    a.addText([{ text: s.kicker.split(" · ")[0] + "   ", options: { color: AMBER, fontFace: SANS, fontSize: 14 } }, { text: s.kicker.split(" · ")[1], options: { color: INK, fontFace: SERIF, fontSize: 22 } }],
      { x: M + col * 6, y: 2.2 + row * 0.85, w: 5.8, h: 0.6 });
  });

  for (const sec of doc.sections) {
    // Divider
    const d = p.addSlide(); d.background = { color: BG }; n++;
    d.addText(sec.kicker.split(" · ")[0], { x: M, y: 1.6, w: 4, h: 1.6, fontFace: SERIF, fontSize: 110, color: AMBER, transparency: 10 });
    d.addText(sec.kicker.split(" · ")[1].toUpperCase(), { x: M, y: 3.5, w: 10, h: 0.4, fontFace: SANS, fontSize: 12, color: AMBER, charSpacing: 4 });
    d.addText(clip(sec.title, 100), { x: M, y: 3.95, w: W - 2 * M, h: 1.6, fontFace: SERIF, fontSize: 40, color: INK, valign: "top", fit: "shrink" });

    for (const u of toUnits(sec.title, sec.blocks, sec.id === "map" ? 12 : Infinity)) {
      const s = p.addSlide(); chrome(s, doc, sec.kicker, ++n); title(s, u.title);
      if (u.kind === "statement") {
        if (u.tone) s.addShape("rect", { x: M, y: 2.35, w: 0.06, h: 3.4, fill: { color: u.tone }, line: { color: u.tone } });
        s.addText(u.quote ? `“${clip(u.text!, 520)}”` : clip(u.text!, 600), { x: M + (u.tone ? 0.35 : 0), y: 2.25, w: W - 2 * M - 1.5, h: 3.8, fontFace: SERIF, italic: u.quote, fontSize: 26, color: INK, valign: "top", fit: "shrink", paraSpaceAfter: 6 });
      } else if (u.kind === "pair") {
        [u.left!, u.right!].forEach((col, ci) => {
          const x = M + ci * ((W - 2 * M) / 2 + 0.2), w = (W - 2 * M) / 2 - 0.2;
          s.addText(clip(col.title, 60), { x, y: 2.1, w, h: 0.5, fontFace: SERIF, fontSize: 19, color: AMBER, valign: "top" });
          s.addText(col.items!.map((t) => ({ text: clip(t.trim(), 220), options: { bullet: { code: "25CF" }, color: INK2, paraSpaceAfter: 10 } })),
            { x, y: 2.7, w, h: 3.9, fontFace: SANS, fontSize: 16, valign: "top", fit: "shrink" });
        });
      } else if (u.kind === "bullets") {
        s.addText(u.items!.map((x) => ({ text: clip(x.trim(), 260), options: { bullet: { code: "25CF" }, indentLevel: Math.min(2, Math.floor((x.match(/^\s*/)?.[0].length ?? 0) / 4)), color: INK2, paraSpaceAfter: 10 } })),
          { x: M, y: 2.2, w: W - 2 * M, h: 4.4, fontFace: SANS, fontSize: 18, valign: "top", fit: "shrink" });
      } else if (u.kind === "kv") {
        const top = u.lead ? 2.75 : 2.2;
        if (u.lead) s.addText(clip(u.lead, 260), { x: M, y: 2.0, w: W - 2 * M, h: 0.65, fontFace: SERIF, fontSize: 17, color: INK, valign: "top", fit: "shrink" });
        if (u.notes) s.addText(clip(u.notes.join("   ·   "), 360), { x: M, y: 6.3, w: W - 2 * M, h: 0.5, fontFace: SANS, fontSize: 11, color: AMBER, valign: "top", fit: "shrink" });
        u.rows!.forEach(([k, v], i) => {
          const y = top + i * (u.notes ? 0.66 : 0.72);
          s.addShape("line", { x: M, y: y + 0.66, w: W - 2 * M, h: 0, line: { color: LINE, width: 0.75 } });
          s.addText(k.toUpperCase(), { x: M, y, w: 3.2, h: 0.62, fontFace: SANS, fontSize: 10, color: INK3, charSpacing: 2, valign: "middle" });
          s.addText(clip(v, 220), { x: M + 3.3, y, w: W - 2 * M - 3.3, h: 0.62, fontFace: SANS, fontSize: 15, color: INK, valign: "middle", fit: "shrink" });
        });
      } else if (u.kind === "table") {
        const total = W - 2 * M;
        const widths = (u.widths ?? u.head!.map(() => 100 / u.head!.length)).map((w) => (w / 100) * total);
        const head = u.head!.map((h) => ({ text: h.toUpperCase(), options: { bold: true, color: AMBER, fill: { color: PANEL }, fontSize: 10, charSpacing: 1 } }));
        const rows = u.rows!.map((r, ri) => r.map((c, ci) => ({ text: clip(c, 160), options: { color: ci === 0 ? INK : INK2, fill: { color: ri % 2 ? "13151B" : BG }, fontSize: 12 } })));
        s.addTable([head, ...rows], { x: M, y: 2.15, w: total, colW: widths, fontFace: SANS, border: { type: "solid", color: LINE, pt: 0.75 }, valign: "middle", margin: 0.08 });
      }
    }
  }

  // Close
  const c = p.addSlide(); c.background = { color: BG };
  c.addShape("ellipse", { x: W / 2 - 0.12, y: 2.4, w: 0.24, h: 0.24, fill: { color: AMBER }, line: { color: AMBER } });
  c.addText("Every thought has potential.", { x: 0, y: 3.0, w: W, h: 0.9, align: "center", fontFace: SERIF, italic: true, fontSize: 34, color: INK });
  c.addText("N E X U S   ·   F R O M   T H O U G H T   T O   E X E C U T I O N", { x: 0, y: 4.0, w: W, h: 0.4, align: "center", fontFace: SANS, fontSize: 10, color: AMBER });

  return (await p.write({ outputType: "blob" })) as Blob;
}
