import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { ORDER_TYPE_LABELS, type PurchaseOrder } from "@/services";

const STATE_LABELS: Record<string, string> = {
  draft: "Draft",
  "to approve": "Pending",
  purchase: "Confirmed",
  done: "Completed",
  cancel: "Cancelled",
};

const number = (n: number) =>
  new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n);

const idr = (n: number) => `Rp ${number(n)}`;

const dateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";

// Order notes are rich-text HTML; exports want plain text with line breaks.
const htmlToText = (html: string): string => {
  const withBreaks = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|h[1-6]|li)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ");
  const text =
    new DOMParser().parseFromString(withBreaks, "text/html").body
      .textContent ?? "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
};

const orderTypeLabel = (order: PurchaseOrder) =>
  ORDER_TYPE_LABELS[order.order_type] ?? order.order_type;

export const generateOrderExcel = (order: PurchaseOrder): ArrayBuffer => {
  const rows: (string | number)[][] = [
    ["PURCHASE ORDER"],
    [],
    ["PO Number", order.name],
    ["Company", order.company?.name ?? "-"],
    ["Customer", order.partner?.name ?? "-"],
    ["Order Type", orderTypeLabel(order)],
    ["Order Date", dateTime(order.date_order)],
    ["Status", STATE_LABELS[order.state] ?? order.state],
    [],
    [
      "No",
      "Product",
      "Code",
      "Vessel",
      "Vessel Name",
      "Region",
      "Project",
      "Code Budget",
      "Priority",
      "Qty",
      "UoM",
      "Unit Price",
      "Subtotal",
    ],
    ...order.lines.map((l, i) => [
      i + 1,
      l.product?.name ?? "",
      l.product?.default_code ?? "",
      l.vessel?.code || l.vessel?.name || "",
      l.vessel?.name ?? "",
      l.region?.name ?? "",
      l.project ?? "",
      l.code_budget?.name ?? "",
      l.priority ?? "",
      l.product_qty,
      l.uom?.name ?? "",
      l.price_unit,
      l.price_subtotal,
    ]),
    [],
    ["", "", "", "", "", "", "", "", "", "", "", "Total", order.amount_total],
  ];

  const notes = htmlToText(order.notes || "");
  if (notes) rows.push([], ["Notes", notes]);

  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = [
    { wch: 12 },
    { wch: 32 },
    { wch: 14 },
    { wch: 14 },
    { wch: 22 },
    { wch: 18 },
    { wch: 18 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 16 },
    { wch: 18 },
  ];

  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Purchase Order");
  return XLSX.write(book, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
};

const loadImageDataUrl = async (url: string): Promise<string | null> => {
  try {
    const blob = await (await fetch(url)).blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
};

export const generateOrderPdf = async (
  order: PurchaseOrder,
): Promise<ArrayBuffer> => {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  const logo = await loadImageDataUrl("/logo-bpg.png");
  if (logo) doc.addImage(logo, "PNG", margin, 10, 16, 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("PURCHASE ORDER", pageWidth - margin, 16, { align: "right" });
  doc.setFontSize(11);
  doc.text(order.name, pageWidth - margin, 22, { align: "right" });

  doc.setFontSize(12);
  doc.text(order.company?.name ?? "", logo ? margin + 20 : margin, 18);

  const info: [string, string][] = [
    ["Customer", order.partner?.name ?? "-"],
    ["Order Type", orderTypeLabel(order)],
    ["Order Date", dateTime(order.date_order)],
    ["Status", STATE_LABELS[order.state] ?? order.state],
  ];
  doc.setFontSize(10);
  info.forEach(([label, value], i) => {
    const y = 34 + i * 6;
    doc.setFont("helvetica", "bold");
    doc.text(label, margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(`: ${value}`, margin + 28, y);
  });

  autoTable(doc, {
    startY: 62,
    margin: { left: margin, right: margin },
    head: [
      [
        "No",
        "Product",
        "Vessel",
        "Region",
        "Project",
        "Priority",
        "Qty",
        "Unit Price",
        "Subtotal",
      ],
    ],
    body: order.lines.map((l, i) => [
      i + 1,
      l.product?.name ?? "",
      l.vessel?.code || l.vessel?.name || "",
      l.region?.name ?? "",
      l.project ?? "",
      l.priority ? l.priority.charAt(0).toUpperCase() : "",
      `${number(l.product_qty)} ${l.uom?.name ?? ""}`.trim(),
      idr(l.price_unit),
      idr(l.price_subtotal),
    ]),
    foot: [
      [
        { content: "Total", colSpan: 8, styles: { halign: "right" } },
        idr(order.amount_total),
      ],
    ],
    styles: { fontSize: 9, cellPadding: 2 },
    headStyles: { fillColor: [60, 60, 60] },
    footStyles: { fillColor: [235, 235, 235], textColor: 20 },
    columnStyles: {
      0: { halign: "center", cellWidth: 10 },
      5: { halign: "center", cellWidth: 16 },
      6: { halign: "right" },
      7: { halign: "right" },
      8: { halign: "right" },
    },
  });

  const notes = htmlToText(order.notes || "");
  let y =
    (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable
      .finalY + 8;
  const pageHeight = doc.internal.pageSize.getHeight();

  if (notes) {
    const wrapped = doc.splitTextToSize(notes, pageWidth - margin * 2);
    if (y + 8 + wrapped.length * 4.5 > pageHeight - 40) {
      doc.addPage();
      y = 20;
    }
    doc.setFont("helvetica", "bold");
    doc.text("Notes", margin, y);
    doc.setFont("helvetica", "normal");
    doc.text(wrapped, margin, y + 5);
    y += 8 + wrapped.length * 4.5;
  }

  if (y > pageHeight - 40) {
    doc.addPage();
    y = 20;
  }
  doc.setFont("helvetica", "bold");
  doc.text("Approved by", pageWidth - margin - 50, y + 4, { align: "center" });
  doc.setFont("helvetica", "normal");
  if (order.first_approver) {
    doc.text(order.first_approver.name, pageWidth - margin - 50, y + 26, {
      align: "center",
    });
    doc.setFontSize(8);
    doc.text(dateTime(order.date_approve), pageWidth - margin - 50, y + 31, {
      align: "center",
    });
  } else {
    doc.text("(not yet approved)", pageWidth - margin - 50, y + 26, {
      align: "center",
    });
  }

  return doc.output("arraybuffer");
};
