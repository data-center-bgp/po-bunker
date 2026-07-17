import { apiRequest, apiRequestBinary, apiRequestVoid } from "./apiClient";

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

export interface PurchaseOrdersResponse {
  purchase_orders: PurchaseOrder[];
  total_count: number;
  page: number;
  limit: number;
}

export interface Vessel {
  id: number;
  name: string;
  type_id: number;
  type_name: string;
  gross_tonage: number;
  call_sign: string | false;
  imo_no: string | false;
  mmsi_no: string | false;
  registered_year: string | false;
  registered_place: string | false;
  operator_id: number | null;
  operator_name: string | null;
  owner_id: number | null;
  owner_name: string | null;
  bussines_unit_id: number | null;
  bussines_unit_id_name: string | null;
  flag_id: number | null;
  flag_name: string | null;
  last_docking: string | null;
  intermediate_docking: string | null;
  annual_docking: string | null;
  status_doc_office: string;
  active: boolean;
  create_date: string;
  write_date: string;
}

export interface VesselsResponse {
  shipping_vessels: Vessel[];
}

export interface RegionCompanyRef {
  id: number;
  name: string;
}

export interface Region {
  id: number;
  name: string;
  code: string | null;
  description?: string | false | null;
  active?: boolean;
  level_region?: string | null;
  bps_code?: number | null;
  parent_id?: number | null;
  parent_name?: string | null;
  parent_code?: string | null;
  child_count?: number;
  children?: Region[];
  companies?: RegionCompanyRef[];
  companies_count?: number;
  create_date?: string;
  write_date?: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

export type RegionsPagination = Pagination;

export interface RegionsResponse {
  regions: Region[];
  pagination?: RegionsPagination;
}

export interface CreateRegionRequest {
  name: string;
  code?: string | null;
  description?: string | null;
  active?: boolean;
  level_region?: string | null;
  bps_code?: number | null;
  parent_id?: number | null;
}

export interface UpdateRegionRequest {
  name?: string;
  code?: string | null;
  description?: string | null;
  active?: boolean;
  level_region?: string | null;
  bps_code?: number | null;
  parent_id?: number | null;
}

export interface Company {
  id: number;
  name: string;
  code_company: string;
  code_company_general: string;
  active: boolean;
  email: string | false;
  phone: string | false;
  website: string | false;
  vat: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  state_id: number | null;
  state_name: string | null;
  country_id: number | null;
  country_name: string | null;
  zip: string | false;
  currency_id: number;
  currency_name: string;
  region_id: number | null;
  region_name: string | null;
  region_code: string | null;
  bussines_unit_id: number;
  bussines_unit_name: string;
  bussines_unit_code: string;
  logo_url: string;
  create_date: string;
  write_date: string;
}

export type CompaniesPagination = Pagination;

export interface CompaniesResponse {
  companies: Company[];
  pagination?: CompaniesPagination;
}

export interface CreateCompanyRequest {
  name: string;
  code_company?: string;
  code_company_general?: string;
  active?: boolean;
  email?: string;
  phone?: string;
  website?: string;
  vat?: string;
  street?: string;
  street2?: string;
  city?: string;
  zip?: string;
  country_id?: number;
  state_id?: number;
  region_id?: number;
  currency_id?: number;
  bussines_unit_id?: number;
}

export type UpdateCompanyRequest = CreateCompanyRequest;

export interface Partner {
  id: number;
  name: string;
  display_name: string;
  type: string;
  is_company: boolean;
  active: boolean;
  email: string | false;
  phone: string | false;
  mobile: string | false;
  website: string | false;
  vat: string | false;
  street: string | false;
  street2: string | false;
  city: string | false;
  zip: string | false;
  state_id: number | null;
  state_name: string | null;
  country_id: number | null;
  country_name: string | null;
  customer_rank: number;
  supplier_rank: number;
  vessel_id: number | null;
  vessel_name: string | null;
  parent_id: number | null;
  parent_name: string | null;
  image_url: string;
  create_date: string;
  write_date: string;
}

export type PartnersPagination = Pagination;

export interface PartnersResponse {
  partners: Partner[];
  pagination?: PartnersPagination;
}

export interface CreatePartnerRequest {
  name: string;
  type?: string;
  is_company?: boolean;
  email?: string;
  phone?: string;
  mobile?: string;
  website?: string;
  vat?: string;
  street?: string;
  street2?: string;
  city?: string;
  zip?: string;
  country_id?: number;
  state_id?: number;
  vessel_id?: number;
  parent_id?: number;
  customer?: boolean;
  supplier?: boolean;
  active?: boolean;
}

export type UpdatePartnerRequest = CreatePartnerRequest;

export interface User {
  id: number;
  name: string;
  login: string;
  email: string | false;
  active: boolean;
}

export interface UsersResponse {
  users: User[];
}

export interface Product {
  id: number;
  name: string;
  default_code: string | false;
  type: string;
  list_price: number;
  standard_price: number;
  categ_id: number;
  categ_name: string;
  uom_id: number;
  uom_name: string;
  active: boolean;
  sale_ok: boolean;
  purchase_ok: boolean;
  code_budget_id: number | null;
  code_budget_name: string | null;
  merk: string | false;
  model: string | false;
  serial_number: string | false;
  specs: string;
  description: string;
  default_reference: string | false;
  partner_reference: string | false;
  image_url: string | null;
  create_date: string;
  write_date: string;
}

export interface ProductsResponse {
  products: Product[];
}

export interface CodeBudget {
  id: number;
  name: string;
  code?: string;
  active?: boolean;
}

export interface CodeBudgetsResponse {
  code_budgets: CodeBudget[];
}

export interface CreateOrderRequest {
  company_id: number;
  partner_id: number;
  order_type: string;
  date_order: string;
  notes: string;
  picking_type_id?: number | null;
  order_lines: {
    product_id: number;
    product_qty: number;
    price_unit: number;
    total_price: number;
    vessel_id: number;
    region_id: number | null;
    category_id: number;
    code_budget_id: number | null;
    uom_id: number;
    project: string;
    requested_by?: number | null;
    priority?: string | null;
  }[];
}

export interface UpdateOrderRequest {
  company_id?: number;
  partner_id?: number;
  order_type?: string;
  date_order?: string;
  notes?: string;
  picking_type_id?: number | null;
  order_lines?: {
    id?: number;
    product_id: number;
    product_qty: number;
    price_unit: number;
    total_price: number;
    vessel_id: number;
    region_id: number | null;
    category_id: number;
    code_budget_id: number | null;
    uom_id: number;
    project: string;
    requested_by?: number | null;
    priority?: string | null;
  }[];
}

const fetchAllPages = async <TResponse, TItem>(
  path: string,
  errorFallback: string,
  getItems: (response: TResponse) => TItem[] | undefined,
  getPagination: (response: TResponse) => Pagination | undefined,
): Promise<{ items: TItem[]; pagination?: Pagination }> => {
  const limit = 200;
  const fetchPage = (page: number) =>
    apiRequest<TResponse>(`${path}?page=${page}&limit=${limit}`, {
      errorFallback,
    });

  const first = await fetchPage(1);
  const items: TItem[] = [...(getItems(first) || [])];
  const pagination = getPagination(first);
  const totalPages = pagination?.total_pages ?? 1;

  for (let page = 2; page <= totalPages; page++) {
    const next = await fetchPage(page);
    items.push(...(getItems(next) || []));
  }

  return { items, pagination };
};

export const ordersApi = {
  getOrders: (
    page: number = 1,
    limit: number = 10,
  ): Promise<PurchaseOrdersResponse> =>
    apiRequest(`/api/purchase-orders?page=${page}&limit=${limit}`, {
      errorFallback: "Failed to fetch orders",
    }),

  getRegions: async (): Promise<RegionsResponse> => {
    const { items, pagination } = await fetchAllPages<RegionsResponse, Region>(
      "/api/regions",
      "Failed to fetch regions",
      (r) => r.regions,
      (r) => r.pagination,
    );
    return { regions: items, pagination };
  },

  getVessels: (): Promise<VesselsResponse> =>
    apiRequest("/api/shipping_vessels", {
      errorFallback: "Failed to fetch vessels",
    }),

  getCompanies: async (): Promise<CompaniesResponse> => {
    const { items, pagination } = await fetchAllPages<
      CompaniesResponse,
      Company
    >(
      "/api/companies",
      "Failed to fetch companies",
      (r) => r.companies,
      (r) => r.pagination,
    );
    return { companies: items, pagination };
  },

  createCompany: (companyData: CreateCompanyRequest): Promise<Company> =>
    apiRequest("/api/companies", {
      method: "POST",
      body: JSON.stringify(companyData),
      errorFallback: "Failed to create company",
    }),

  updateCompany: (
    id: number,
    companyData: UpdateCompanyRequest,
  ): Promise<Company> =>
    apiRequest(`/api/companies/${id}`, {
      method: "PUT",
      body: JSON.stringify(companyData),
      errorFallback: "Failed to update company",
    }),

  getPartners: async (): Promise<PartnersResponse> => {
    const { items, pagination } = await fetchAllPages<
      PartnersResponse,
      Partner
    >(
      "/api/partners",
      "Failed to fetch partners",
      (r) => r.partners,
      (r) => r.pagination,
    );
    return { partners: items, pagination };
  },

  createPartner: (partnerData: CreatePartnerRequest): Promise<Partner> =>
    apiRequest("/api/partners", {
      method: "POST",
      body: JSON.stringify(partnerData),
      errorFallback: "Failed to create partner",
    }),

  updatePartner: (
    id: number,
    partnerData: UpdatePartnerRequest,
  ): Promise<Partner> =>
    apiRequest(`/api/partners/${id}`, {
      method: "PUT",
      body: JSON.stringify(partnerData),
      errorFallback: "Failed to update partner",
    }),

  getProducts: (): Promise<ProductsResponse> =>
    apiRequest("/api/products", { errorFallback: "Failed to fetch products" }),

  getUsers: (): Promise<UsersResponse> =>
    apiRequest("/api/users", { errorFallback: "Failed to fetch users" }),

  getCodeBudgets: (): Promise<CodeBudgetsResponse> =>
    apiRequest("/api/code-budgets", {
      errorFallback: "Failed to fetch code budgets",
    }),

  createOrder: (orderData: CreateOrderRequest): Promise<PurchaseOrder> =>
    apiRequest("/api/purchase-orders", {
      method: "POST",
      body: JSON.stringify(orderData),
      errorFallback: "Failed to create order",
    }),

  /**
   * Generate Excel for a purchase order by id.
   * Returns an ArrayBuffer of the XLSX file.
   */
  generateExcel: (id: number): Promise<ArrayBuffer> =>
    apiRequestBinary(`/api/purchase-orders/${id}/generate-excel`, {
      errorFallback: "Failed to generate excel",
    }),

  /**
   * Generate PDF for a purchase order by id.
   * Returns an ArrayBuffer of the PDF file.
   */
  generatePdf: (id: number): Promise<ArrayBuffer> =>
    apiRequestBinary(`/api/purchase-orders/${id}/generate-pdf`, {
      errorFallback: "Failed to generate PDF",
    }),

  updateOrder: (
    id: number,
    orderData: UpdateOrderRequest,
  ): Promise<PurchaseOrder> =>
    apiRequest(`/api/purchase-orders/${id}`, {
      method: "PUT",
      body: JSON.stringify(orderData),
      errorFallback: "Failed to update order",
    }),

  deleteOrder: (id: number): Promise<void> =>
    apiRequestVoid(`/api/purchase-orders/${id}`, {
      method: "DELETE",
      errorFallback: "Failed to delete order",
    }),

  cancelOrder: (id: number): Promise<PurchaseOrder> =>
    apiRequest(`/api/purchase-orders/${id}/cancel`, {
      method: "POST",
      errorFallback: "Failed to cancel order",
    }),

  getOrderById: (id: number): Promise<PurchaseOrder> =>
    apiRequest(`/api/purchase-orders/${id}`, {
      errorFallback: "Failed to fetch order",
    }),

  confirmOrder: (id: number): Promise<PurchaseOrder> =>
    apiRequest(`/api/purchase-orders/${id}/confirm`, {
      method: "POST",
      errorFallback: "Failed to confirm order",
    }),

  draftOrder: (id: number): Promise<PurchaseOrder> =>
    apiRequest(`/api/purchase-orders/${id}/set-to-draft`, {
      method: "POST",
      errorFallback: "Failed to set order to draft",
    }),

  createRegion: (regionData: CreateRegionRequest): Promise<Region> =>
    apiRequest("/api/regions", {
      method: "POST",
      body: JSON.stringify(regionData),
      errorFallback: "Failed to create region",
    }),

  updateRegion: (
    id: number,
    regionData: UpdateRegionRequest,
  ): Promise<Region> =>
    apiRequest(`/api/regions/${id}`, {
      method: "PUT",
      body: JSON.stringify(regionData),
      errorFallback: "Failed to update region",
    }),
};
