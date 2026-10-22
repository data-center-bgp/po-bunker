// Row shapes returned by the po_bunker schema (see supabase/migrations).
// Nested objects come from PostgREST embeds in the service queries.

export interface Ref {
  id: number;
  name: string;
}

export type OrderState = "draft" | "to approve" | "purchase" | "done" | "cancel";
export type OrderType = "bunker_fuel" | "bunker_water" | "logistic";
export type Priority = "low" | "medium" | "high";
export type UserRole = "admin" | "staff" | "viewer";

export const ORDER_TYPE_LABELS: Record<OrderType, string> = {
  bunker_fuel: "Bunker Fuel",
  bunker_water: "Bunker Fresh Water",
  logistic: "Logistic",
};

export interface Profile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  active: boolean;
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
  name: string;
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
  project: string;
  requested_by: string | null;
  priority: Priority | null;
  product: { id: number; name: string; default_code: string | null } | null;
  vessel: Ref | null;
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
  created_by: string | null;
  first_approved_by: string | null;
  first_approved_at: string | null;
  company: { id: number; name: string; code_company: string | null } | null;
  partner: Ref | null;
  first_approver: { id: string; name: string } | null;
  lines: OrderLine[];
}

export interface OrderHeaderInput {
  company_id: number;
  partner_id: number;
  order_type: OrderType;
  date_order: string; // ISO timestamp
  notes: string;
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
