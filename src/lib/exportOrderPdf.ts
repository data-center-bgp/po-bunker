import { jsPDF } from "jspdf";
import autoTable, {
  type CellDef,
  type RowInput,
  type Styles,
} from "jspdf-autotable";
import type { PurchaseOrder } from "@/services";
import {
  buildPrintData,
  formatMoney,
  FOOTNOTE_TEXT,
  PAYMENT_METHOD_TEXT,
  PAYMENT_SCHEDULE_TEXT,
  type ImageLoader,
  type PrintImage,
} from "./orderPrintData";

// Draws the bilingual "ORDER PEMBELIAN / PURCHASE ORDER" form (bunker layout)
// that the old system printed: A4 portrait, 12-column grid, lavender labels.

const MARGIN = 8;
const LAVENDER: [number, number, number] = [230, 230, 250];
const RED: [number, number, number] = [220, 0, 0];
const BLUE: [number, number, number] = [0, 0, 220];
const MIN_BODY_ROWS = 9;

// No, Requested by, Vessel, Project, Budget, Priority, Description, Type, Vol, Sat, Unit price, Total
const COLUMN_WIDTHS = [6, 17, 13, 15, 14, 13, 27, 15, 14, 10, 22, 28];
const FIRST_SIGNATURE_COLUMNS = [0, 5, 8]; // where each of the 3 signature cells starts

const fit = (image: PrintImage, maxW: number, maxH: number) => {
  const ratio = image.width / image.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
};

const label = (
  content: string,
  { colSpan, ...styles }: { colSpan?: number } & Partial<Styles> = {},
): CellDef => ({
  content,
  colSpan,
  styles: { fillColor: LAVENDER, fontStyle: "bold", ...styles },
});

export const generateOrderPdf = async (
  order: PurchaseOrder,
  loadImage?: ImageLoader,
): Promise<ArrayBuffer> => {
  const data = await buildPrintData(order, loadImage);
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - MARGIN * 2;

  // --- logo and title -------------------------------------------------------
  let y = 8;
  if (data.logo) {
    const { w, h } = fit(data.logo, 60, 22);
    doc.addImage(data.logo.dataUrl, data.logo.format, (pageWidth - w) / 2, y, w, h);
    y += h + 3;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.text("ORDER PEMBELIAN", pageWidth / 2, y + 4, { align: "center" });
  const titleWidth = doc.getTextWidth("ORDER PEMBELIAN");
  doc.setLineWidth(0.3);
  doc.line(
    pageWidth / 2 - titleWidth / 2,
    y + 4.8,
    pageWidth / 2 + titleWidth / 2,
    y + 4.8,
  );
  doc.setFont("helvetica", "bolditalic");
  doc.text("PURCHASE ORDER", pageWidth / 2, y + 10, { align: "center" });
  y += 14;

  // --- header block -----------------------------------------------------------
  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: 0,
      valign: "middle",
      halign: "center",
    },
    columnStyles: {
      0: { cellWidth: contentWidth * 0.16 },
      1: { cellWidth: contentWidth * 0.45 },
      2: { cellWidth: contentWidth * 0.16 },
      3: { cellWidth: contentWidth * 0.23 },
    },
    body: [
      [
        label("No. PO:", { halign: "right" }),
        data.poNumber,
        label("Tgl PO / PO Date:", { halign: "right" }),
        data.poDate,
      ],
      [
        label("Kepada / To:", { halign: "right" }),
        data.vendorName,
        label("Faksimili / Faximile:", { halign: "right" }),
        data.vendorPhone,
      ],
      [
        label("Alamat / Address:", { halign: "right" }),
        data.vendorAddress,
        label("Telepon / Telephone:", { halign: "right" }),
        data.vendorPhone,
      ],
    ],
  });

  let after = (doc as unknown as { lastAutoTable: { finalY: number } })
    .lastAutoTable.finalY;

  // --- vendor reference text ----------------------------------------------------
  doc.setFontSize(6.5);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Sesuai dengan Penawaran dari Perusahaan Anda Nomor / as per your company's ${data.optionLabel}: ${data.partnerRef}`,
    MARGIN + 1,
    after + 4,
  );
  doc.text(`Tertanggal / Dated: ${data.dateVendor}`, MARGIN + 1, after + 8);
  doc.text(
    "Harap dikirim barang-barang berikut ini / Please deliver these items:",
    pageWidth - MARGIN - 1,
    after + 8,
    { align: "right" },
  );
  doc.setLineWidth(0.2);
  doc.line(MARGIN, after + 10, pageWidth - MARGIN, after + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.text(
    "DATA PESANAN PEMBELIAN / PURCHASE ORDER DETAILS",
    MARGIN + 1,
    after + 14,
  );
  after += 16;

  // --- order lines and everything below them -------------------------------------
  const body: RowInput[] = [];
  const cancelledRows = new Set<number>();

  data.lines.forEach((l) => {
    if (l.cancelled) cancelledRows.add(body.length);
    body.push([
      String(l.no),
      l.requestedBy,
      l.vessel,
      l.project,
      l.budget,
      l.priority,
      { content: l.description, styles: { halign: "left" } },
      l.type,
      String(l.qty),
      l.uom,
      {
        content: l.unitPrice === 0 ? "Rp. -" : formatMoney(l.unitPrice),
        styles: { halign: "right" },
      },
      {
        content: l.subtotal === 0 ? "Rp. -" : formatMoney(l.subtotal),
        styles: { halign: "right" },
      },
    ]);
  });

  while (body.length < MIN_BODY_ROWS) {
    body.push(Array.from({ length: 12 }, () => ({ content: "", styles: {} })));
  }

  data.remarks.forEach((r) => {
    body.push([
      {
        content: r.text,
        colSpan: 11,
        styles: {
          halign: "left",
          fontStyle: "bolditalic",
          fontSize: 8,
          textColor: r.color === "biru" ? BLUE : RED,
        },
      },
      "",
    ]);
  });

  body.push([
    {
      content: "Harga Total / Total Price",
      colSpan: 11,
      styles: { halign: "center", fontStyle: "bold", fontSize: 8 },
    },
    {
      content: formatMoney(data.linesTotal),
      styles: { halign: "right", fontStyle: "bold", fontSize: 8 },
    },
  ]);

  body.push([
    {
      content: FOOTNOTE_TEXT,
      colSpan: 7,
      rowSpan: 3,
      styles: { halign: "left", valign: "top", fontSize: 5.8, textColor: RED },
    },
    label("Discount", { colSpan: 2, halign: "center", fontSize: 8 }),
    { content: "", colSpan: 2, styles: { fillColor: LAVENDER } },
    {
      content: formatMoney(data.discount),
      styles: { halign: "right", fontStyle: "bold", fontSize: 8 },
    },
  ]);
  body.push([
    label("PPN / VAT", { colSpan: 2, halign: "center", fontSize: 8 }),
    {
      content: data.taxPercent ? `${data.taxPercent}%` : "",
      colSpan: 2,
      styles: { halign: "center", fontStyle: "bold", fontSize: 8 },
    },
    {
      content: data.tax > 0 ? formatMoney(data.tax) : "",
      styles: { halign: "right", fontStyle: "bold", fontSize: 8 },
    },
  ]);
  body.push([
    label("HARGA TOTAL", { colSpan: 4, halign: "center", fontSize: 8 }),
    {
      content: formatMoney(data.total),
      styles: { halign: "right", fontStyle: "bold", fontSize: 8 },
    },
  ]);

  body.push([
    {
      content: `Terbilang / In number:  ${data.terbilangText}`,
      colSpan: 12,
      styles: { halign: "left", fontStyle: "bold", fontSize: 8 },
    },
  ]);
  body.push([
    label("Jadwal Pembayaran / Payment Schedule:", {
      colSpan: 5,
      halign: "left",
      fontSize: 8,
    }),
    { content: PAYMENT_SCHEDULE_TEXT, colSpan: 7, styles: { fontSize: 7.5 } },
  ]);
  body.push([
    label("Cara Pembayaran / Payment Method:", {
      colSpan: 5,
      halign: "left",
      fontSize: 8,
    }),
    { content: PAYMENT_METHOD_TEXT, colSpan: 7, styles: { fontSize: 7.5 } },
  ]);
  body.push([
    label("Dibuat oleh / Prepared by:", { colSpan: 5, halign: "left", fontSize: 8 }),
    label("Disetujui oleh / Approved by:", {
      colSpan: 7,
      halign: "center",
      fontSize: 8,
    }),
  ]);

  const signatureRow = body.length;
  body.push([
    { content: "", colSpan: 5 },
    { content: "", colSpan: 3 },
    { content: "", colSpan: 4 },
  ]);
  const roleStyle = {
    halign: "center" as const,
    fontStyle: "bolditalic" as const,
    fontSize: 6.5,
  };
  body.push([
    label(data.approvals[0].label, { colSpan: 5, ...roleStyle }),
    label(data.approvals[1].label, { colSpan: 3, ...roleStyle }),
    label(data.approvals[2].label, { colSpan: 4, ...roleStyle }),
  ]);

  autoTable(doc, {
    startY: after,
    margin: { left: MARGIN, right: MARGIN },
    theme: "grid",
    styles: {
      fontSize: 7.5,
      cellPadding: 1.2,
      lineColor: [0, 0, 0],
      lineWidth: 0.2,
      textColor: 0,
      valign: "middle",
      halign: "center",
      overflow: "linebreak",
    },
    headStyles: {
      fillColor: LAVENDER,
      textColor: 0,
      fontStyle: "bold",
      fontSize: 6.5,
      minCellHeight: 13,
    },
    columnStyles: Object.fromEntries(
      COLUMN_WIDTHS.map((w, i) => [i, { cellWidth: w }]),
    ),
    head: [
      [
        "No.",
        "Diminta oleh/\nRequested by",
        "Vessel\nDept / Div",
        "Proyek /\nProject",
        "Kode Anggaran /\nBudget Code",
        "Prioritas /\nPriority*\n(L/M/H)",
        "Uraian /\nDescription",
        "Jenis /\nType",
        "Vol.",
        "Sat.",
        "Harga Satuan /\nUnit Price (Rp.)",
        "Jumlah Harga /\nTotal Price (Rp.)",
      ],
    ],
    body,
    didParseCell: (hook) => {
      if (hook.section !== "body") return;
      if (hook.row.index < MIN_BODY_ROWS && hook.row.index < data.lines.length) {
        if (cancelledRows.has(hook.row.index)) {
          hook.cell.styles.textColor = [120, 120, 120];
        }
      }
      if (hook.row.index === signatureRow) hook.cell.styles.minCellHeight = 24;
    },
    didDrawCell: (hook) => {
      if (hook.section !== "body") return;

      // Strike through cancelled lines.
      if (cancelledRows.has(hook.row.index) && hook.cell.text.join("").trim()) {
        doc.setDrawColor(90, 90, 90);
        doc.setLineWidth(0.25);
        const mid = hook.cell.y + hook.cell.height / 2;
        doc.line(hook.cell.x + 1, mid, hook.cell.x + hook.cell.width - 1, mid);
        doc.setDrawColor(0, 0, 0);
      }

      // Signatures in the three boxes above the role labels.
      if (hook.row.index === signatureRow) {
        const slot = FIRST_SIGNATURE_COLUMNS.indexOf(hook.column.index);
        const image = slot >= 0 ? data.approvals[slot].image : null;
        if (image) {
          const { w, h } = fit(image, hook.cell.width - 6, hook.cell.height - 4);
          doc.addImage(
            image.dataUrl,
            image.format,
            hook.cell.x + (hook.cell.width - w) / 2,
            hook.cell.y + (hook.cell.height - h) / 2,
            w,
            h,
          );
        }
      }
    },
  });

  return doc.output("arraybuffer");
};
