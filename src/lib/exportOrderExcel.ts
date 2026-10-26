import ExcelJS from "exceljs";
import type { PurchaseOrder } from "@/services";
import {
  buildPrintData,
  FOOTNOTE_TEXT,
  PAYMENT_METHOD_TEXT,
  PAYMENT_SCHEDULE_TEXT,
  type ImageLoader,
  type PrintImage,
} from "./orderPrintData";

// The same bilingual PO form as the PDF, laid out like the old Odoo workbook:
// A4 portrait, columns A:O, gridlines hidden, at least 19 body rows.

const LAVENDER = "FFE8E2FB";
const COLUMN_WIDTHS = [
  4.025, 15.9, 8.75, 11.4, 10.5, 8, 30, 7.75, 7.75, 4.65, 6.65, 6.65, 7.75, 7.75,
  16.5,
];
const MIN_BODY_ROWS = 19;
const MONEY = '"Rp."#,##0.00;-"Rp."#,##0.00;"Rp. -"';

const thin: Partial<ExcelJS.Borders> = {
  top: { style: "thin" },
  left: { style: "thin" },
  bottom: { style: "thin" },
  right: { style: "thin" },
};

interface BoxStyle {
  bold?: boolean;
  italic?: boolean;
  size?: number;
  color?: string;
  fill?: string;
  align?: "left" | "center" | "right";
  border?: boolean;
  numFmt?: string;
  strike?: boolean;
}

// Merge A1-style cell range [c1..c2] x [r1..r2] and write the value into it.
// Styles are applied to every cell first so borders survive the merge.
const box = (
  ws: ExcelJS.Worksheet,
  r1: number,
  c1: number,
  r2: number,
  c2: number,
  value: ExcelJS.CellValue,
  style: BoxStyle = {},
) => {
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const cell = ws.getCell(r, c);
      cell.font = {
        name: "Calibri",
        size: style.size ?? 10,
        bold: style.bold,
        italic: style.italic,
        strike: style.strike,
        color: style.color ? { argb: style.color } : undefined,
      };
      if (style.fill) {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: style.fill },
        };
      }
      if (style.border !== false) cell.border = thin;
      cell.alignment = {
        vertical: "middle",
        horizontal: style.align ?? "left",
        wrapText: true,
      };
      if (style.numFmt) cell.numFmt = style.numFmt;
    }
  }
  if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
  ws.getCell(r1, c1).value = value;
};

// "Kepada /" bold + "To :" bold italic, like the old workbook.
const bilingual = (id: string, en: string): ExcelJS.CellRichTextValue => ({
  richText: [
    { text: `${id} / `, font: { bold: true, size: 10, name: "Calibri" } },
    { text: en, font: { bold: true, italic: true, size: 10, name: "Calibri" } },
  ],
});

const columnPixels = (from: number, to: number) => {
  let px = 0;
  for (let c = from; c <= to; c++) px += COLUMN_WIDTHS[c - 1] * 7 + 5;
  return px;
};

// Column position (0-based, fractional) that is `px` pixels right of column `start`.
const colAtOffset = (start: number, px: number) => {
  let col = start - 1;
  let left = px;
  while (left > 0 && col < COLUMN_WIDTHS.length) {
    const width = COLUMN_WIDTHS[col] * 7 + 5;
    if (left < width) return col + left / width;
    left -= width;
    col++;
  }
  return col;
};

const safeSheetName = (name: string) =>
  name.replace(/[\\/?*[\]:]/g, "-").slice(0, 31) || "Purchase Order";

export const generateOrderExcel = async (
  order: PurchaseOrder,
  loadImage?: ImageLoader,
): Promise<ArrayBuffer> => {
  const data = await buildPrintData(order, loadImage);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(safeSheetName(order.name), {
    views: [{ showGridLines: false }],
  });
  COLUMN_WIDTHS.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const addPicture = (
    image: PrintImage,
    col: number,
    row: number,
    maxW: number,
    maxH: number,
  ) => {
    const ratio = image.width / image.height;
    let w = maxW;
    let h = w / ratio;
    if (h > maxH) {
      h = maxH;
      w = h * ratio;
    }
    const id = wb.addImage({
      base64: image.dataUrl,
      extension: image.format === "PNG" ? "png" : "jpeg",
    });
    ws.addImage(id, { tl: { col, row }, ext: { width: w, height: h } });
    return { w, h };
  };

  // --- logo and title (rows 1-10) ---------------------------------------------
  if (data.logo) addPicture(data.logo, 1.1, 0.2, 260, 110);

  ws.getRow(9).height = 36;
  ws.getRow(10).height = 36;
  ws.getRow(11).height = 24;
  box(ws, 9, 1, 9, 15, "ORDER PEMBELIAN", {
    border: false,
    align: "center",
    bold: true,
    size: 22,
  });
  ws.getCell(9, 1).font = {
    name: "Times New Roman",
    size: 22,
    bold: true,
    underline: true,
  };
  box(ws, 10, 1, 10, 15, "PURCHASE ORDER", {
    border: false,
    align: "center",
    bold: true,
    italic: true,
    size: 22,
  });
  ws.getCell(10, 1).font = {
    name: "Times New Roman",
    size: 22,
    bold: true,
    italic: true,
  };

  if (data.cancelled) {
    box(
      ws,
      11,
      1,
      11,
      15,
      `CANCELLED${data.cancelled.reason ? ` - ${data.cancelled.reason}` : ""}`,
      { border: false, align: "center", bold: true, size: 12, color: "FFC80000" },
    );
  }

  // --- header block (rows 12-14) -----------------------------------------------
  [12, 13, 14].forEach((r) => (ws.getRow(r).height = 22));
  const head = (r: number, left: ExcelJS.CellValue, leftValue: string, right: ExcelJS.CellValue, rightValue: string) => {
    box(ws, r, 1, r, 2, left, { fill: LAVENDER, align: "right", size: 12 });
    box(ws, r, 3, r, 7, leftValue, { align: "center", bold: true, size: 12 });
    box(ws, r, 8, r, 10, right, { fill: LAVENDER, align: "right", size: 12 });
    box(ws, r, 11, r, 15, rightValue, { align: "center", bold: true, size: 12 });
  };
  head(12, bilingual("No. PO", ":"), data.poNumber, bilingual("Tgl PO", "PO Date :"), data.poDate);
  head(13, bilingual("Kepada", "To :"), data.vendorName, bilingual("Faksimili", "Faximile :"), data.vendorPhone);
  head(14, bilingual("Alamat", "Address :"), data.vendorAddress, bilingual("Telepon", "Telephone :"), data.vendorPhone);

  ws.getRow(15).height = 18;
  ws.getRow(16).height = 18;
  box(
    ws,
    15,
    1,
    15,
    7,
    `Sesuai dengan Penawaran dari Perusahaan Anda Nomor / as per your company's ${data.optionLabel}: ${data.partnerRef}`,
    { border: false },
  );
  box(ws, 16, 1, 16, 7, `Tertanggal / Dated: ${data.dateVendor}`, { border: false });
  box(ws, 16, 8, 16, 15, "Harap dikirim barang-barang berikut ini / Please deliver these items:", {
    border: false,
    align: "right",
  });

  // --- table header (rows 17-19) -------------------------------------------------
  ws.getRow(17).height = 18;
  ws.getRow(18).height = 18;
  ws.getRow(19).height = 66;
  box(ws, 17, 1, 17, 15, "DATA PESANAN PEMBELIAN / PURCHASE ORDER DETAILS", {
    fill: LAVENDER,
    bold: true,
  });
  const th = (c1: number, c2: number, text: string) =>
    box(ws, 18, c1, 19, c2, text, { fill: LAVENDER, bold: true, align: "center" });
  th(1, 1, "No.");
  th(2, 2, "Diminta oleh/\nRequested By");
  th(3, 3, "Vessel\nDept/Div");
  th(4, 4, "Proyek/\nProject");
  th(5, 5, "Kode\nAnggaran/\nBudget Code");
  th(6, 6, "Prioritas /\nPriority*\n(L/M/H)");
  th(7, 7, "Uraian/\nDescription");
  th(8, 9, "Jenis/\nType");
  th(10, 10, "Vol.");
  th(11, 11, "Sat.");
  th(12, 14, "Harga Satuan\n/Unit Price\n(Rp)");
  th(15, 15, "Jumlah Harga/\nTotal Price (Rp)");

  // --- order lines ------------------------------------------------------------------
  let r = 20;
  const lineCount = Math.max(MIN_BODY_ROWS, data.lines.length);
  for (let i = 0; i < lineCount; i++, r++) {
    ws.getRow(r).height = 24;
    const l = data.lines[i];
    const s: BoxStyle = { size: 11, strike: l?.cancelled, color: l?.cancelled ? "FF787878" : undefined };
    box(ws, r, 1, r, 1, l ? l.no : "", { ...s, align: "center" });
    box(ws, r, 2, r, 2, l?.requestedBy ?? "", s);
    box(ws, r, 3, r, 3, l?.vessel ?? "", { ...s, align: "center" });
    box(ws, r, 4, r, 4, l?.project ?? "", { ...s, align: "center" });
    box(ws, r, 5, r, 5, l?.budget ?? "", { ...s, align: "center" });
    box(ws, r, 6, r, 6, l?.priority ?? "", { ...s, align: "center" });
    box(ws, r, 7, r, 7, l?.description ?? "", s);
    box(ws, r, 8, r, 9, l?.type ?? "", s);
    box(ws, r, 10, r, 10, l ? l.qty : "", { ...s, align: "center" });
    box(ws, r, 11, r, 11, l?.uom ?? "", { ...s, align: "center" });
    box(ws, r, 12, r, 14, l ? l.unitPrice : "", { ...s, align: "right", numFmt: MONEY });
    box(ws, r, 15, r, 15, l ? l.subtotal : "", { ...s, align: "right", numFmt: MONEY });
  }

  data.remarks.forEach((remark) => {
    ws.getRow(r).height = 20;
    box(ws, r, 1, r, 14, remark.text, {
      bold: true,
      italic: true,
      size: 10,
      color: remark.color === "biru" ? "FF0000DC" : "FFDC0000",
    });
    box(ws, r, 15, r, 15, "", {});
    r++;
  });

  // --- totals -------------------------------------------------------------------------
  ws.getRow(r).height = 20;
  box(ws, r, 1, r, 14, bilingual("Harga Total", "Total Price"), { align: "center" });
  box(ws, r, 15, r, 15, data.linesTotal, { align: "right", numFmt: MONEY, bold: true });
  r++;

  [r, r + 1, r + 2].forEach((row) => (ws.getRow(row).height = 30));
  box(ws, r, 1, r + 2, 8, FOOTNOTE_TEXT, {
    size: 8,
    color: "FFDC0000",
    bold: true,
  });
  box(ws, r, 9, r, 11, "Discount", { fill: LAVENDER, bold: true, align: "center" });
  box(ws, r, 12, r, 14, "", { fill: LAVENDER });
  box(ws, r, 15, r, 15, data.discount, { align: "right", numFmt: MONEY });
  box(ws, r + 1, 9, r + 1, 11, bilingual("PPN", "VAT"), { fill: LAVENDER, align: "center" });
  box(ws, r + 1, 12, r + 1, 14, data.taxPercent ? `${data.taxPercent}%` : "", { bold: true, align: "center" });
  box(ws, r + 1, 15, r + 1, 15, data.tax, { align: "right", numFmt: MONEY });
  box(ws, r + 2, 9, r + 2, 14, "Harga Total", { fill: LAVENDER, bold: true, align: "center" });
  box(ws, r + 2, 15, r + 2, 15, data.total, { align: "right", numFmt: MONEY, bold: true });
  r += 3;

  ws.getRow(r).height = 22;
  box(ws, r, 1, r, 15, `Terbilang / In number:  ${data.terbilangText}`, { bold: true });
  r++;

  ws.getRow(r).height = 18;
  box(ws, r, 1, r, 5, bilingual("Jadwal Pembayaran", "Payment Schedule:"), { fill: LAVENDER });
  box(ws, r, 6, r, 15, PAYMENT_SCHEDULE_TEXT, { bold: true, align: "center" });
  r++;
  ws.getRow(r).height = 18;
  box(ws, r, 1, r, 5, bilingual("Cara Pembayaran", "Payment Method :"), { fill: LAVENDER });
  box(ws, r, 6, r, 15, PAYMENT_METHOD_TEXT, { bold: true, align: "center" });
  r++;

  // --- signatures -------------------------------------------------------------------------
  ws.getRow(r).height = 18;
  box(ws, r, 1, r, 5, bilingual("Dibuat oleh", "Prepared by:"), { fill: LAVENDER });
  box(ws, r, 6, r, 15, bilingual("Disetujui oleh", "Approved by:"), {
    fill: LAVENDER,
    align: "center",
  });
  r++;

  const signatureRow = r;
  ws.getRow(r).height = 80;
  const SLOTS: [number, number][] = [
    [1, 5],
    [6, 9],
    [10, 15],
  ];
  SLOTS.forEach(([c1, c2], i) => {
    box(ws, r, c1, r, c2, "", { align: "center" });
    const image = data.approvals[i].image;
    if (image) {
      const boxWidth = columnPixels(c1, c2);
      const maxW = boxWidth - 24;
      const ratio = image.width / image.height;
      const w = Math.min(maxW, 100 * ratio);
      const offset = (boxWidth - w) / 2;
      addPicture(image, colAtOffset(c1, offset), signatureRow - 1 + 0.06, maxW, 100);
    }
  });
  r++;

  ws.getRow(r).height = 18;
  SLOTS.forEach(([c1, c2], i) => {
    box(ws, r, c1, r, c2, data.approvals[i].label, {
      fill: LAVENDER,
      bold: true,
      italic: true,
      align: "center",
    });
  });

  ws.pageSetup = {
    paperSize: 9, // A4
    orientation: "portrait",
    margins: { left: 0.5, right: 0.5, top: 0.5, bottom: 0.5, header: 0.3, footer: 0.3 },
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:O${r}`,
  };

  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
};
