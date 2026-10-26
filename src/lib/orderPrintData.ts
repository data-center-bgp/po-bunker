import {
  APPROVAL_LEVELS,
  storageService,
  type PurchaseOrder,
  type RemarkColor,
} from "@/services";
import { terbilang } from "./terbilang";

// Everything the PO form prints, already formatted, so the PDF and the Excel
// export read from one place.

export type ImageLoader = (path: string) => Promise<string | null>;

export interface PrintImage {
  dataUrl: string;
  width: number;
  height: number;
  format: "PNG" | "JPEG";
}

export interface PrintLine {
  no: number;
  requestedBy: string;
  vessel: string;
  project: string;
  budget: string;
  priority: string;
  description: string;
  type: string;
  qty: number;
  uom: string;
  unitPrice: number;
  subtotal: number;
  cancelled: boolean;
}

export interface PrintData {
  logo: PrintImage | null;
  poNumber: string;
  poDate: string;
  vendorName: string;
  vendorAddress: string;
  vendorPhone: string;
  optionLabel: "quotation" | "invoice";
  partnerRef: string;
  dateVendor: string;
  lines: PrintLine[];
  remarks: { text: string; color: RemarkColor }[];
  linesTotal: number;
  discount: number;
  taxPercent: number;
  tax: number;
  total: number;
  terbilangText: string;
  approvals: { label: string; image: PrintImage | null }[];
}

export const FOOTNOTE_TEXT =
  "Catatan / Note:\n" +
  "*) Kategori risiko item yang diminta (L=Low, M=Medium, H=High). Item dengan kategori risiko High atau tinggi yaitu " +
  "jika terlambat pengadaannya dapat menyebabkan kecelakaan, kerusakan atau pencemaran/tumpahan minyak. Untuk segera " +
  "dikirimkan. / Risk category of requested items (L=Low, M=Medium, H=High). Item with high risk category means in case " +
  "any delay in delivery may result an accident, damage or pollution/oil spill. Must be delivered as soon as possible.\n" +
  "**) Semua bahan kimia berbahaya wajib disertai MSDS. Beri tanda (v). / all dangerous chemical substances must be " +
  "completed with MSDS. Put (v) sign.";

export const PAYMENT_SCHEDULE_TEXT =
  "(A). 1 Minggu        (B). 2 Minggu        (C). 1 Bulan        (D). 2 Bulan";
export const PAYMENT_METHOD_TEXT =
  "(A). Tunai / Cash        (B). Transfer Rekening / Account Transfer        (C). Cheque";

// "Rp.1.234.567", and "Rp. -" for zero (as on the old form).
export const formatMoney = (n: number): string =>
  n === 0
    ? "Rp. -"
    : `Rp.${new Intl.NumberFormat("id-ID", { maximumFractionDigits: 2 }).format(n)}`;

const dateTime = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const dateOnly = (iso: string | null): string =>
  iso
    ? new Date(iso).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : "";

const toImage = (dataUrl: string | null): Promise<PrintImage | null> => {
  if (!dataUrl) return Promise.resolve(null);
  const format = dataUrl.startsWith("data:image/png") ? "PNG" : "JPEG";
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () =>
      resolve({
        dataUrl,
        width: img.naturalWidth,
        height: img.naturalHeight,
        format,
      });
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
};

const fetchDataUrl = async (url: string): Promise<string | null> => {
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

const PRIORITY: Record<string, string> = { high: "H", medium: "M", low: "L" };

export const buildPrintData = async (
  order: PurchaseOrder,
  loadImage: ImageLoader = storageService.getDataUrl,
): Promise<PrintData> => {
  const logoSource = order.company?.logo_path
    ? await loadImage(order.company.logo_path)
    : null;

  const [logo, ...signatures] = await Promise.all([
    toImage(logoSource ?? (await fetchDataUrl("/logo-bpg.png"))),
    ...APPROVAL_LEVELS.map(async ({ level }) => {
      const path = order[`${level}_approved_signature_path`];
      return toImage(path ? await loadImage(path) : null);
    }),
  ]);

  const partner = order.partner;
  const address = [partner?.street, partner?.city].filter(Boolean).join(" ");

  return {
    logo,
    poNumber: order.name,
    poDate: dateTime(order.date_order),
    vendorName: partner?.name ?? "",
    vendorAddress: address,
    vendorPhone: partner?.phone ?? "",
    optionLabel: order.option_order,
    partnerRef: order.partner_ref ?? "",
    dateVendor: dateOnly(order.date_vendor),
    lines: order.lines.map((l, i) => ({
      no: i + 1,
      requestedBy: l.requester?.name ?? "",
      vessel: l.vessel?.code || l.vessel?.name || "",
      project: l.project ?? "",
      budget: l.code_budget?.name ?? "",
      priority: l.priority ? (PRIORITY[l.priority] ?? "") : "",
      description: l.product?.name ?? "",
      type:
        l.product?.specs ||
        [l.product?.merk, l.product?.model, l.product?.serial_number]
          .filter(Boolean)
          .join(", "),
      qty: l.product_qty,
      uom: l.uom?.name ?? "",
      unitPrice: l.price_unit,
      subtotal: l.price_subtotal,
      cancelled: l.status_list === "cancel",
    })),
    remarks: order.remarks.map((r) => ({
      text: `Note: ${new Date(r.remark_date).toLocaleDateString("en-GB")} ${r.remark}`,
      color: r.color,
    })),
    linesTotal: order.amount_untaxed + order.amount_discount,
    discount: order.amount_discount,
    taxPercent: order.tax_percent,
    tax: order.amount_tax,
    total: order.amount_total,
    terbilangText: terbilang(order.amount_total),
    approvals: APPROVAL_LEVELS.map(({ label }, i) => ({
      label,
      image: signatures[i] ?? null,
    })),
  };
};
