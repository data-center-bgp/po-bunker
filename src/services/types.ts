// Row shapes returned by the po_bunker schema (see supabase/migrations).
// Nested objects come from PostgREST embeds in the service queries.

export interface Ref {
  id: number;
  name: string;
}

// submitted: created (locked); completed: DO uploaded + actual quantities;
// cancelled: wrongly made or really cancelled, with a reason.
export type OrderState = "submitted" | "completed" | "cancelled";

export const ORDER_STATE_LABELS: Record<OrderState, string> = {
  submitted: "Diajukan",
  completed: "Selesai",
  cancelled: "Dibatalkan",
};
export type OrderType = "bunker_fuel" | "bunker_water" | "logistic";
export type Priority = "low" | "medium" | "high";
export type UserRole = "admin" | "staff" | "viewer";
export const USER_ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  staff: "Staf",
  viewer: "Viewer",
};
export type ApprovalLevel = "first" | "second" | "third";
export type LineStatus = "onprogress" | "hold" | "cancel" | "close";
export type OptionOrder = "quotation" | "invoice";
export type RemarkColor = "merah" | "biru";

// Labels printed under the three signature boxes on the PO form.
export const APPROVAL_LEVELS: { level: ApprovalLevel; label: string }[] = [
  { level: "first", label: "Corporate Logistic Admin" },
  { level: "second", label: "Corporate Logistic" },
  { level: "third", label: "Business Unit PIC" },
];

export const LINE_STATUS_LABELS: Record<LineStatus, string> = {
  onprogress: "Berjalan",
  hold: "Ditahan",
  cancel: "Dibatalkan",
  close: "Ditutup",
};

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  bunker_fuel: "Bunker BBM",
  bunker_water: "Bunker Air Tawar",
  logistic: "Logistik",
};

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  signature_path: string | null;
  approval_levels: ApprovalLevel[];
}

/** A person with access to PO Bunker (po_bunker.profiles + last sign-in). */
export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
  created_at: string;
  last_sign_in_at: string | null;
}

export interface Region {
  id: number;
  name: string;
  code: string | null;
  description: string | null;
  level_region: string | null;
  bps_code: number | null;
  parent_id: number | null;
  parent_name: string | null;
  parent_code: string | null;
  child_count: number;
  companies_count: number;
  active: boolean;
}

export interface RegionInput {
  name: string;
  code: string | null;
  description: string | null;
  level_region: string | null;
  bps_code: number | null;
  parent_id: number | null;
  active: boolean;
}

export interface BusinessUnit {
  id: number;
  name: string;
  code: string | null;
}

export interface Company {
  id: number;
  name: string;
  code_company: string | null;
  code_company_general: string | null;
  active: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  vat: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  region_id: number | null;
  currency: string;
  business_unit_id: number | null;
  logo_path: string | null;
  region: { id: number; name: string; code: string | null } | null;
  business_unit: BusinessUnit | null;
}

export interface CompanyInput {
  name: string;
  code_company: string | null;
  code_company_general: string | null;
  active: boolean;
  email: string | null;
  phone: string | null;
  website: string | null;
  vat: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  region_id: number | null;
  currency: string;
  business_unit_id: number | null;
  /** Only sent when the logo changed. */
  logo_path?: string | null;
}

export interface Partner {
  id: number;
  name: string;
  type: string;
  is_company: boolean;
  is_supplier: boolean;
  is_customer: boolean;
  active: boolean;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  vat: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  vessel_id: number | null;
  parent_id: number | null;
  parent: Ref | null;
  vessel: Ref | null;
}

export interface PartnerInput {
  name: string;
  type: string;
  is_company: boolean;
  is_supplier: boolean;
  is_customer: boolean;
  active: boolean;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  website: string | null;
  vat: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  zip: string | null;
  vessel_id: number | null;
  parent_id: number | null;
}

export interface Vessel {
  id: number;
  /** id in the company SMS vessel API (set by the sync). */
  external_id: number | null;
  name: string;
  fleet_name: string | null;
  operation_head_name: string | null;
  headcount_code: string | null;
  headcount_name: string | null;
  synced_at: string | null;
  /** Short code printed in the Vessel column of the PO PDF/Excel. */
  code: string | null;
  type_id: number | null;
  gross_tonage: number | null;
  call_sign: string | null;
  imo_no: string | null;
  mmsi_no: string | null;
  registered_year: string | null;
  registered_place: string | null;
  flag: string | null;
  active: boolean;
  type: Ref | null;
  operator: Ref | null;
  owner: Ref | null;
  business_unit: Ref | null;
}

export interface VesselSyncResult {
  ok: boolean;
  pages: number;
  total: number;
  created: number;
  updated: number;
  adopted: number;
  deactivated: number;
  skipped: number;
  types_created: number;
}

export interface Product {
  id: number;
  name: string;
  default_code: string | null;
  category_id: number;
  uom_id: number;
  code_budget_id: number | null;
  standard_price: number;
  active: boolean;
  category: Ref | null;
  uom: Ref | null;
  code_budget: Ref | null;
}

export interface CodeBudget {
  id: number;
  name: string;
  code: string | null;
  active: boolean;
}

export interface OrderLine {
  id: number;
  order_id: number;
  product_id: number;
  vessel_id: number;
  region_id: number | null;
  code_budget_id: number | null;
  category_id: number | null;
  uom_id: number;
  product_qty: number;
  price_unit: number;
  price_subtotal: number;
  actual_qty: number | null;
  actual_subtotal: number | null;
  project: string;
  requested_by: string | null;
  priority: Priority | null;
  status_list: LineStatus;
  product: {
    id: number;
    name: string;
    default_code: string | null;
    merk: string | null;
    model: string | null;
    serial_number: string | null;
    specs: string | null;
  } | null;
  vessel: { id: number; name: string; code: string | null } | null;
  region: Ref | null;
  uom: Ref | null;
  code_budget: Ref | null;
  category: Ref | null;
  requester: { id: string; name: string } | null;
}

export interface PurchaseOrder {
  id: number;
  name: string;
  company_id: number;
  partner_id: number;
  order_type: OrderType;
  state: OrderState;
  date_order: string;
  date_approve: string | null;
  notes: string;
  amount_untaxed: number;
  amount_tax: number;
  amount_discount: number;
  amount_total: number;
  option_order: OptionOrder;
  partner_ref: string | null;
  date_vendor: string | null;
  date_bunker: string | null;
  tax_percent: number;
  created_by: string | null;
  first_approved_by: string | null;
  first_approved_at: string | null;
  first_approved_signature_path: string | null;
  second_approved_by: string | null;
  second_approved_at: string | null;
  second_approved_signature_path: string | null;
  third_approved_by: string | null;
  third_approved_at: string | null;
  third_approved_signature_path: string | null;
  company: {
    id: number;
    name: string;
    code_company: string | null;
    logo_path: string | null;
  } | null;
  partner: {
    id: number;
    name: string;
    street: string | null;
    city: string | null;
    phone: string | null;
  } | null;
  creator: { id: string; name: string } | null;
  completer: { id: string; name: string } | null;
  canceller: { id: string; name: string } | null;
  completed_at: string | null;
  completed_by: string | null;
  cancel_reason: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  actual_amount: number | null;
  documents: OrderDocument[];
  remarks: OrderRemark[];
  lines: OrderLine[];
}

export interface OrderDocument {
  id: number;
  order_id: number;
  doc_type: "delivery_order";
  file_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_at: string;
  uploader: { id: string; name: string } | null;
}

export interface OrderRemark {
  id: number;
  order_id: number;
  remark_date: string;
  color: RemarkColor;
  remark: string;
}

export interface OrderHeaderInput {
  company_id: number;
  partner_id: number;
  order_type: OrderType;
  date_order: string; // ISO timestamp
  notes: string;
  option_order: OptionOrder;
  partner_ref: string | null;
  date_vendor: string | null; // ISO timestamp
  date_bunker: string | null; // ISO timestamp
  amount_discount: number;
  tax_percent: number;
}

export interface OrderLineInput {
  id?: number;
  product_id: number;
  vessel_id: number;
  uom_id: number;
  product_qty: number;
  price_unit: number;
  region_id: number | null;
  code_budget_id: number | null;
  category_id: number | null;
  project: string;
  requested_by: string | null;
  priority: Priority | null;
}
