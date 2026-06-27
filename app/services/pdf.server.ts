import PDFDocument from "pdfkit";

/**
 * In-app PDF generation (CLAUDE.md §3, BUILD-PHASES Phase 2 item 6). We render the
 * merchant-facing label + manifest ourselves so a downloadable PDF is guaranteed
 * regardless of each courier's label-format quirks. Courier-hosted label URLs (from
 * adapter.getLabel) are kept too, but this is the canonical artifact.
 */

export interface LabelAddress {
  name: string;
  phone: string;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  pincode: string;
}

export interface LabelData {
  courierName: string;
  awb: string;
  orderName: string;
  shipFrom: LabelAddress;
  shipTo: LabelAddress;
  weightGrams: number;
  cod: boolean;
  codAmount?: number; // minor units
  currency: string;
  items: Array<{ name: string; quantity: number }>;
}

export interface ManifestRow {
  awb: string;
  courierName: string;
  orderName: string;
  destination: string;
}

function renderToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A5", margin: 28 });
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    build(doc);
    doc.end();
  });
}

const money = (minor: number, currency: string) => `${currency} ${(minor / 100).toFixed(2)}`;

function addressBlock(doc: PDFKit.PDFDocument, title: string, a: LabelAddress) {
  doc.fontSize(8).fillColor("#666").text(title.toUpperCase());
  doc.fontSize(10).fillColor("#000").text(a.name);
  doc.text([a.line1, a.line2].filter(Boolean).join(", "));
  doc.text(`${a.city}, ${a.state} - ${a.pincode}`);
  doc.text(`Ph: ${a.phone}`);
}

export function generateLabelPdf(data: LabelData): Promise<Buffer> {
  return renderToBuffer((doc) => {
    doc.fontSize(16).text(data.courierName, { align: "left" });
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor("#666").text(`Order ${data.orderName}`);
    doc.moveDown(0.5);

    // AWB — the most prominent element on the label.
    doc.fontSize(9).fillColor("#666").text("AWB / TRACKING NO.");
    doc.fontSize(20).fillColor("#000").text(data.awb);
    doc.moveDown(0.5);

    if (data.cod) {
      doc
        .fontSize(12)
        .fillColor("#b00")
        .text(`COD: ${money(data.codAmount ?? 0, data.currency)}`);
    } else {
      doc.fontSize(12).fillColor("#070").text("PREPAID");
    }
    doc.moveDown(0.5);
    doc.fillColor("#000");

    addressBlock(doc, "Ship to", data.shipTo);
    doc.moveDown(0.5);
    addressBlock(doc, "Ship from", data.shipFrom);
    doc.moveDown(0.5);

    doc.fontSize(8).fillColor("#666").text(`Weight: ${data.weightGrams} g`);
    doc.fillColor("#000").fontSize(9);
    doc.text("Items:");
    for (const item of data.items) {
      doc.text(`  • ${item.name} × ${item.quantity}`);
    }
  });
}

export function generateManifestPdf(data: {
  shop: string;
  dateLabel: string;
  rows: ManifestRow[];
}): Promise<Buffer> {
  return renderToBuffer((doc) => {
    doc.fontSize(16).text("Shipping Manifest");
    doc.fontSize(9).fillColor("#666").text(`${data.shop} — ${data.dateLabel}`);
    doc.fillColor("#000").moveDown(1);

    doc.fontSize(9);
    doc.text("AWB", 28, doc.y, { continued: true, width: 110 });
    doc.text("Courier", { continued: true, width: 90 });
    doc.text("Order", { continued: true, width: 70 });
    doc.text("Destination");
    doc.moveTo(28, doc.y + 2).lineTo(400, doc.y + 2).stroke();
    doc.moveDown(0.5);

    for (const r of data.rows) {
      doc.text(r.awb, 28, doc.y, { continued: true, width: 110 });
      doc.text(r.courierName, { continued: true, width: 90 });
      doc.text(r.orderName, { continued: true, width: 70 });
      doc.text(r.destination);
    }

    doc.moveDown(1);
    doc.fontSize(9).fillColor("#666").text(`Total shipments: ${data.rows.length}`);
  });
}
