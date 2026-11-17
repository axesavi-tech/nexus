import {
  AlignmentType, BorderStyle, LineRuleType, Document, Footer, Header, HeadingLevel, LevelFormat, Packer, PageBreak, PageNumber,
  Paragraph, ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import type { Block, DocModel } from "./model";

const AMBER = "B57425", INK = "1C1B19", INK2 = "4C4A45", INK3 = "85827A", LINE = "E4DED2", BAND = "F3EFE6";
const SERIF = "Georgia", SANS = "Calibri";
const CONTENT_W = 9360; // US Letter / A4 safe width with 1" margins (DXA)

const run = (text: string, o: Partial<{ bold: boolean; italics: boolean; color: string; size: number; font: string }> = {}) =>
  new TextRun({ text, bold: o.bold, italics: o.italics, color: o.color ?? INK2, size: o.size ?? 21, font: o.font ?? SANS });

const border = { style: BorderStyle.SINGLE, size: 4, color: LINE };
const borders = { top: border, bottom: border, left: border, right: border };

function table(head: string[], rows: string[][], widths?: number[]) {
  const pct = widths ?? head.map(() => 100 / head.length);
  const cols = pct.map((w) => Math.round((w / 100) * CONTENT_W));
  const cell = (text: string, i: number, header: boolean, zebra: boolean) => new TableCell({
    borders, width: { size: cols[i], type: WidthType.DXA },
    shading: header ? { fill: BAND, type: ShadingType.CLEAR, color: "auto" } : zebra ? { fill: "FAF8F3", type: ShadingType.CLEAR, color: "auto" } : undefined,
    margins: { top: 70, bottom: 70, left: 110, right: 110 },
    children: [new Paragraph({ children: [run(header ? text.toUpperCase() : text, { bold: header || i === 0, size: header ? 16 : 19, color: header ? INK2 : INK })] })],
  });
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cols,
    rows: [
      new TableRow({ tableHeader: true, children: head.map((h, i) => cell(h, i, true, false)) }),
      ...rows.map((r, ri) => new TableRow({ cantSplit: true, children: r.map((c, i) => cell(c, i, false, ri % 2 === 1)) })),
    ],
  });
}

function kvTable(rows: [string, string][]) {
  const cols = [Math.round(CONTENT_W * 0.28), Math.round(CONTENT_W * 0.72)];
  const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
  const b = { top: none, left: none, right: none, bottom: border };
  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: cols,
    rows: rows.map(([k, v]) => new TableRow({ cantSplit: true, children: [
      new TableCell({ borders: b, width: { size: cols[0], type: WidthType.DXA }, margins: { top: 80, bottom: 80, right: 160 }, children: [new Paragraph({ children: [new TextRun({ text: k.toUpperCase(), font: SANS, size: 15, bold: true, color: INK3 })] })] }),
      new TableCell({ borders: b, width: { size: cols[1], type: WidthType.DXA }, margins: { top: 80, bottom: 80 }, children: [new Paragraph({ children: [run(v, { color: INK })] })] }),
    ] })),
  });
}

function blocks(b: Block): (Paragraph | Table)[] {
  switch (b.t) {
    case "lead": return [new Paragraph({ spacing: { after: 200 }, children: [run(b.text, { font: SERIF, size: 26, color: INK })] })];
    case "p": return [new Paragraph({ spacing: { after: 140 }, children: [run(b.text)] })];
    case "h3": return [new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(b.text)] })];
    case "quote": return [new Paragraph({ spacing: { after: 220 }, indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: AMBER, space: 12 } }, children: [run(b.text, { font: SERIF, italics: true, size: 26, color: INK })] })];
    case "bullets": return b.items.map((x) => {
      const depth = Math.min(3, Math.floor((x.match(/^\s*/)?.[0].length ?? 0) / 4));
      return new Paragraph({ numbering: { reference: "dots", level: depth }, spacing: { after: 60 }, children: [run(x.trim())] });
    });
    case "kv": return [kvTable(b.rows), new Paragraph({ spacing: { after: 120 }, children: [] })];
    case "table": return [table(b.head, b.rows, b.widths), new Paragraph({ spacing: { after: 120 }, children: [] })];
    case "callout": {
      const tone = b.tone === "warn" ? "A8641A" : b.tone === "sage" ? "2F7A63" : AMBER;
      return [new Paragraph({ spacing: { before: 120, after: 200 }, shading: { fill: BAND, type: ShadingType.CLEAR, color: "auto" }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: tone, space: 10 } }, indent: { left: 200 }, children: [run(b.text, { color: INK2 })] })];
    }
  }
}

export async function renderDocx(doc: DocModel): Promise<Blob> {
  const cover: Paragraph[] = [
    new Paragraph({ spacing: { after: 1600 }, children: [new TextRun({ text: "◉  N E X U S", font: SANS, size: 20, bold: true, color: AMBER })] }),
    new Paragraph({ spacing: { after: 160 }, children: [new TextRun({ text: "FROM THOUGHT TO EXECUTION", font: SANS, size: 16, color: AMBER, characterSpacing: 40 })] }),
    new Paragraph({ heading: HeadingLevel.TITLE, children: [new TextRun(doc.title)] }),
    new Paragraph({ spacing: { before: 200, after: 600 }, indent: { left: 360 }, border: { left: { style: BorderStyle.SINGLE, size: 18, color: AMBER, space: 12 } }, children: [run(`“${doc.thought}”`, { font: SERIF, italics: true, size: 28, color: INK2 })] }),
    new Paragraph({ children: doc.stats.flatMap((x, i) => [new TextRun({ text: `${i ? "      " : ""}${x.value} `, font: SERIF, size: 36, color: AMBER }), new TextRun({ text: x.label.toUpperCase(), font: SANS, size: 15, color: INK3 })]) }),
    new Paragraph({ spacing: { before: 1200 }, children: [run(doc.date, { color: INK3, size: 18 })] }),
    new Paragraph({ children: [run(doc.aiNote, { color: INK3, size: 18 })] }),
    new Paragraph({ children: [new PageBreak()] }),
    new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun("Contents")] }),
    ...doc.sections.map((x) => new Paragraph({ spacing: { after: 80 }, children: [run(x.kicker.split(" · ")[0] + "   ", { color: AMBER }), run(x.kicker.split(" · ")[1], { color: INK })] })),
  ];

  const body: (Paragraph | Table)[] = [];
  for (const sec of doc.sections) {
    body.push(new Paragraph({ pageBreakBefore: true, spacing: { after: 80 }, children: [new TextRun({ text: sec.kicker.toUpperCase(), font: SANS, size: 16, bold: true, color: AMBER, characterSpacing: 30 })] }));
    body.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(sec.title)] }));
    for (const b of sec.blocks) body.push(...blocks(b));
  }

  const d = new Document({
    creator: "NEXUS", title: doc.title, description: doc.thought,
    styles: {
      default: { document: { run: { font: SANS, size: 21, color: INK2 }, paragraph: { spacing: { line: 300, lineRule: LineRuleType.AUTO } } } },
      paragraphStyles: [
        { id: "Title", name: "Title", basedOn: "Normal", run: { font: SERIF, size: 64, color: INK }, paragraph: { spacing: { after: 200, line: 250, lineRule: LineRuleType.AUTO } } },
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: SERIF, size: 44, color: INK }, paragraph: { spacing: { before: 0, after: 280, line: 250, lineRule: LineRuleType.AUTO }, outlineLevel: 0 } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: SERIF, size: 27, bold: true, color: INK }, paragraph: { spacing: { before: 280, after: 120, line: 260, lineRule: LineRuleType.AUTO }, keepNext: true, outlineLevel: 1 } },
      ],
    },
    numbering: { config: [{ reference: "dots", levels: [0, 1, 2, 3].map((level) => ({ level, format: LevelFormat.BULLET, text: level ? "–" : "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 360 + level * 360, hanging: 260 } }, run: { color: AMBER } } })) }] },
    sections: [
      { properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1273, right: 1273 } } }, children: cover },
      {
        properties: { page: { size: { width: 11906, height: 16838 }, margin: { top: 1440, bottom: 1440, left: 1273, right: 1273 } } },
        headers: { default: new Header({ children: [new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LINE, space: 4 } }, children: [new TextRun({ text: "NEXUS   ·   " + doc.title, font: SANS, size: 15, color: INK3 })] })] }) },
        footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ children: [PageNumber.CURRENT, " / ", PageNumber.TOTAL_PAGES], font: SANS, size: 15, color: INK3 })] })] }) },
        children: body,
      },
    ],
  });
  return Packer.toBlob(d);
}
