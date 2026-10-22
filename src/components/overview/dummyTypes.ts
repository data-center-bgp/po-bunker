// Shape of the sample data behind the Overview dashboard. The dashboard still
// renders dummy data (it is not wired to Supabase yet), so these types are kept
// local instead of using the real order types in @/services.

export interface OrderLine {
  id: number;
  product_id: number;
  product_name: string;
  product_code: string | boolean;
  name: string;
  product_qty: number;
  product_uom: number;
  product_uom_name: string;
  price_unit: number;
  price_subtotal: number;
  price_total: number;
  taxes_id: number[];
  date_planned: string;
  requested_by: number | null;
  requested_by_name: string | null;
  project_id: number | null;
  project_name: string | null;
  divisi_id: number | null;
  divisi_name: string | null;
  code_budget_id: number | null;
  code_budget_name: string | null;
  priority: string | null;
  description: boolean;
  remark: boolean;
  status_list: boolean;
  status_thing: boolean;
  vessel_id: number;
  vessel_name: string;
  region_id: number | null;
  region_name: string | null;
  form_type: boolean;
}

export interface PurchaseOrder {
  id: number;
  name: string;
  partner_id: number;
  partner_name: string;
  partner_ref: boolean;
  order_type: string;
  state: string;
  date_order: string;
  date_approve: string | null;
  date_planned: string;
  date_create: string;
  user_id: number;
  user_name: string;
  company_id: number;
  company_name: string;
  currency_id: number;
  currency_name: string;
  amount_untaxed: number;
  amount_tax: number;
  amount_discount: number;
  amount_total: number;
  notes: string;
  payment_term_id: number | null;
  payment_term_name: string | null;
  fiscal_position_id: number | null;
  picking_type_id: number;
  picking_type_name: string;
  is_ppn: boolean;
  option_order: string;
  is_order_from_stock: boolean;
  first_approved_id: number | null;
  first_approved_name: string | null;
  first_approved_date: string | null;
  first_approved_signature_url: string | null;
  second_approved_id: number | null;
  second_approved_name: string | null;
  second_approved_date: string | null;
  second_approved_signature_url: string | null;
  third_approved_id: number | null;
  third_approved_name: string | null;
  third_approved_date: string | null;
  third_approved_signature_url: string | null;
  date_bunker: string | null;
  date_vendor: string | null;
  discount_ids: number[];
  taxes_ids: number[];
  create_date: string;
  write_date: string;
  order_lines: OrderLine[];
  remarks: string[];
}
