import type { OrderLine, PurchaseOrder } from "@/services/api";

interface VendorSeed {
  id: number;
  name: string;
}

interface BuyerSeed {
  id: number;
  name: string;
}

interface VesselSeed {
  id: number;
  name: string;
}

interface ProductSeed {
  id: number;
  name: string;
  code: string;
  uom_id: number;
  uom_name: string;
  unit_price: number;
}

interface RegionSeed {
  id: number;
  name: string;
}

interface CompanySeed {
  id: number;
  name: string;
}

const VENDORS: VendorSeed[] = [
  { id: 101, name: "PT Pertamina International Shipping" },
  { id: 102, name: "Shell Marine Products Asia" },
  { id: 103, name: "Vitol Bunker Rotterdam" },
  { id: 104, name: "Trafigura Maritime Fuels" },
  { id: 105, name: "Chemoil Energy Singapore" },
  { id: 106, name: "Sinopec Fuel Oil Singapore" },
  { id: 107, name: "BP Marine Asia Pacific" },
];

const BUYERS: BuyerSeed[] = [
  { id: 201, name: "Budi Santoso" },
  { id: 202, name: "Siti Rahmawati" },
  { id: 203, name: "Andi Wijaya" },
  { id: 204, name: "Dewi Lestari" },
  { id: 205, name: "Rizki Pratama" },
];

const VESSELS: VesselSeed[] = [
  { id: 301, name: "MV Barokah Perkasa 01" },
  { id: 302, name: "MV Gemilang Star" },
  { id: 303, name: "MV Nusantara Express" },
  { id: 304, name: "MV Cemerlang Voyage" },
  { id: 305, name: "MV Samudra Jaya" },
  { id: 306, name: "MV Bahari Makmur" },
  { id: 307, name: "MV Mandala Bahari" },
];

const PRODUCTS: ProductSeed[] = [
  {
    id: 401,
    name: "Marine Fuel Oil 380 CST (MFO 380)",
    code: "MFO-380",
    uom_id: 11,
    uom_name: "Metric Tons",
    unit_price: 8250000,
  },
  {
    id: 402,
    name: "Marine Gas Oil 0.1%S (MGO 0.1)",
    code: "MGO-01",
    uom_id: 11,
    uom_name: "Metric Tons",
    unit_price: 11450000,
  },
  {
    id: 403,
    name: "Low Sulphur Marine Fuel Oil 0.5%S (LSMFO)",
    code: "LSMFO-05",
    uom_id: 11,
    uom_name: "Metric Tons",
    unit_price: 9650000,
  },
  {
    id: 404,
    name: "High Speed Diesel (HSD)",
    code: "HSD-50",
    uom_id: 11,
    uom_name: "Metric Tons",
    unit_price: 13200000,
  },
  {
    id: 405,
    name: "Marine Fuel Oil 180 CST (MFO 180)",
    code: "MFO-180",
    uom_id: 11,
    uom_name: "Metric Tons",
    unit_price: 8700000,
  },
];

const REGIONS: RegionSeed[] = [
  { id: 501, name: "Belawan" },
  { id: 502, name: "Tanjung Priok" },
  { id: 503, name: "Tanjung Perak" },
  { id: 504, name: "Makassar" },
  { id: 505, name: "Balikpapan" },
  { id: 506, name: "Singapore OPL" },
];

const COMPANIES: CompanySeed[] = [
  { id: 601, name: "PT Barokah Gemilang Perkasa" },
  { id: 602, name: "PT Barokah Gemilang Perkasa Jakarta Branch" },
  { id: 603, name: "PT Barokah Gemilang Perkasa Surabaya Branch" },
];

const PROJECTS: { id: number; name: string | null }[] = [
  { id: 701, name: "Routine Fuel Procurement 2024" },
  { id: 702, name: "Jakarta-Surabaya Voyage Q2" },
  { id: 703, name: "Bunkering Operations Q3" },
  { id: 704, name: "Vessel Maintenance Cycle" },
  { id: 705, name: "Coastal Bunker Supply" },
  { id: 706, name: null },
];

const CODE_BUDGETS: { id: number; name: string }[] = [
  { id: 801, name: "Buk-BBA-2024" },
  { id: 802, name: "Buk-OPS-2024" },
  { id: 803, name: "Buk-BNK-2024" },
  { id: 804, name: "Buk-MNT-2024" },
];

const DIVISIONS: { id: number; name: string }[] = [
  { id: 901, name: "Bunkering Division" },
  { id: 902, name: "Operations Division" },
  { id: 903, name: "Logistics Division" },
];

const REQUESTERS: { id: number; name: string }[] = [
  { id: 201, name: "Budi Santoso" },
  { id: 202, name: "Siti Rahmawati" },
  { id: 203, name: "Andi Wijaya" },
  { id: 204, name: "Dewi Lestari" },
  { id: 205, name: "Rizki Pratama" },
];

const PRIORITIES: string[] = ["Normal", "High", "Urgent", "Critical"];

// Deterministic PRNG so dummy data is stable between renders/sessions.
// Using Math.random would re-shuffle on every HMR, which is jarring.
const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const rand = mulberry32(20240716);

const pick = <T,>(arr: readonly T[]): T =>
  arr[Math.floor(rand() * arr.length)];

const pickState = (): PurchaseOrder["state"] => {
  const r = rand();
  if (r < 0.28) return "draft";
  if (r < 0.5) return "purchase";
  if (r < 0.66) return "done";
  if (r < 0.82) return "to approve";
  return "cancel";
};

const fmtIdRupiah = (v: number): string => {
  return "Rp " + v.toLocaleString("id-ID", { maximumFractionDigits: 0 });
};

const buildLine = (
  idx: number,
  datePlanned: string,
  cancelled: boolean,
): OrderLine => {
  const product = pick(PRODUCTS);
  const vessel = pick(VESSELS);
  const region = pick(REGIONS);
  const project = pick(PROJECTS);
  const codeBudget = pick(CODE_BUDGETS);
  const division = pick(DIVISIONS);
  const requester = pick(REQUESTERS);
  const priority = pick(PRIORITIES);

  // Realistic bunker quantities: a single bunker lift ranges widely
  // but typically 80-1200 MT. We vary deliberately so the dashboard
  // chart bars have visual spread.
  const qty = Math.round((80 + rand() * 1120) / 5) * 5;
  const priceUnit = product.unit_price;
  const subtotal = qty * priceUnit;
  const ppnRate = 0.11; // Indonesian PPN (VAT) raised to 11% Jan 2022
  const total = subtotal + subtotal * ppnRate;

  let priceUnitFinal = priceUnit;
  let subtotalFinal = subtotal;
  let totalFinal = total;
  if (cancelled) {
    // Cancelled POs effectively contribute zero value but keep their
    // physical line items intact, mirroring Odoo behaviour where
    // cancellation freezes but doesn't delete line totals.
    priceUnitFinal = priceUnit;
    subtotalFinal = subtotal;
    totalFinal = subtotal;
  }

  return {
    id: idx,
    product_id: product.id,
    product_name: product.name,
    product_code: product.code,
    name: `${product.name} for ${vessel.name}`,
    product_qty: qty,
    product_uom: product.uom_id,
    product_uom_name: product.uom_name,
    price_unit: priceUnitFinal,
    price_subtotal: subtotalFinal,
    price_total: totalFinal,
    taxes_id: cancelled ? [] : [1],
    date_planned: datePlanned,
    requested_by: requester.id,
    requested_by_name: requester.name,
    project_id: project.id,
    project_name: project.name,
    divisi_id: division.id,
    divisi_name: division.name,
    code_budget_id: codeBudget.id,
    code_budget_name: codeBudget.name,
    priority,
    description: false,
    remark: false,
    status_list: false,
    status_thing: false,
    vessel_id: vessel.id,
    vessel_name: vessel.name,
    region_id: region.id,
    region_name: region.name,
    form_type: false,
  };
};

const buildOrder = (seq: number): PurchaseOrder => {
  // Spread date_create across the trailing ~180 days so the monthly-trend
  // widget always has multiple bars populated. Anchored to a fixed
  // reference date so the demo doesn't drift with wall-clock time.
  const REFERENCE_NOW = new Date("2024-07-16T09:00:00Z");
  const daysAgo = Math.floor(rand() * 180);
  const createDate = new Date(REFERENCE_NOW.getTime() - daysAgo * 86400000);
  const dateCreateIso = createDate.toISOString();
  const plannedDate = new Date(createDate.getTime() + 3 * 86400000).toISOString();
  const state = pickState();
  const isApproved = state === "purchase" || state === "done";
  const isCompleted = state === "done";
  const isCancelled = state === "cancel";

  const vendor = pick(VENDORS);
  const buyer = pick(BUYERS);
  const company = pick(COMPANIES);
  const lineCount = 1 + Math.floor(rand() * 3); // 1–3 lines per PO
  const lines = Array.from({ length: lineCount }, (_, i) =>
    buildLine(seq * 10 + i, plannedDate, isCancelled),
  );
  const amountUntaxed = lines.reduce((s, l) => s + l.price_subtotal, 0);
  const amountTax = isCancelled
    ? 0
    : lines.reduce((s, l) => s + (l.price_total - l.price_subtotal), 0);
  const amountDiscount = rand() < 0.2 ? Math.round(amountUntaxed * 0.02) : 0;
  const amountTotal = amountUntaxed - amountDiscount + amountTax;

  const year = createDate.getUTCFullYear();
  const seqPad = String(seq).padStart(4, "0");
  const name = `PO/${year}/${seqPad}`;

  const approver = pick(BUYERS);
  const secondApprover = pick(BUYERS);
  const approveDate = isApproved
    ? new Date(createDate.getTime() + 1 * 86400000).toISOString()
    : null;

  return {
    id: seq,
    name,
    partner_id: vendor.id,
    partner_name: vendor.name,
    partner_ref: false,
    order_type: "bunker",
    state,
    date_order: dateCreateIso,
    date_approve: approveDate,
    date_planned: plannedDate,
    date_create: dateCreateIso,
    user_id: buyer.id,
    user_name: buyer.name,
    company_id: company.id,
    company_name: company.name,
    currency_id: 1,
    currency_name: "IDR",
    amount_untaxed: amountUntaxed,
    amount_tax: amountTax,
    amount_discount: amountDiscount,
    amount_total: amountTotal,
    notes: "",
    payment_term_id: 1,
    payment_term_name: "30 Days",
    fiscal_position_id: 1,
    picking_type_id: 1,
    picking_type_name: "Bunkering Operations",
    is_ppn: !isCancelled,
    option_order: "bunker",
    is_order_from_stock: rand() < 0.4,
    first_approved_id: isApproved ? approver.id : null,
    first_approved_name: isApproved ? approver.name : null,
    first_approved_date: approveDate,
    first_approved_signature_url: null,
    second_approved_id: isCompleted ? secondApprover.id : null,
    second_approved_name: isCompleted ? secondApprover.name : null,
    second_approved_date: isCompleted ? approveDate : null,
    second_approved_signature_url: null,
    third_approved_id: null,
    third_approved_name: null,
    third_approved_date: null,
    third_approved_signature_url: null,
    date_bunker: isApproved ? plannedDate : null,
    date_vendor: isApproved
      ? new Date(createDate.getTime() + 2 * 86400000).toISOString()
      : null,
    discount_ids: amountDiscount > 0 ? [1] : [],
    taxes_ids: isCancelled ? [] : [1],
    create_date: dateCreateIso,
    write_date: dateCreateIso,
    order_lines: lines,
    remarks: [],
  };
};

const ORDER_COUNT = 36;
export const dummyOrders: PurchaseOrder[] = Array.from(
  { length: ORDER_COUNT },
  (_, i) => buildOrder(i + 1),
);

export const DASHBOARD_REFERENCE_DATE = "2024-07-16T09:00:00Z";

export const formatIDR = (v: number): string => fmtIdRupiah(v);

export const formatCompactIDR = (v: number): string => {
  if (v >= 1_000_000_000) return "Rp " + (v / 1_000_000_000).toFixed(1) + " B";
  if (v >= 1_000_000) return "Rp " + (v / 1_000_000).toFixed(1) + " M";
  return formatIDR(v);
};