import { API_URL, getAuthHeaders } from "./config";
import { tokenManager } from "./tokenManager";

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

export interface RegionsPagination {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

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

export interface CompaniesResponse {
  companies: Company[];
}

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

export interface PartnersPagination {
  page: number;
  limit: number;
  total_records: number;
  total_pages: number;
}

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

export const ordersApi = {
  getOrders: async (
    page: number = 1,
    limit: number = 10,
  ): Promise<PurchaseOrdersResponse> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(
      `${API_URL}/api/purchase-orders?page=${page}&limit=${limit}`,
      {
        method: "GET",
        headers: getAuthHeaders(token),
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch orders");
    }

    return response.json();
  },

  getRegions: async (): Promise<RegionsResponse> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const fetchPage = async (page: number, limit: number) => {
      const response = await fetch(
        `${API_URL}/api/regions?page=${page}&limit=${limit}`,
        {
          method: "GET",
          headers: getAuthHeaders(token),
        },
      );
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized. Please login again.");
        }
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch regions");
      }
      return response.json() as Promise<RegionsResponse>;
    };

    const limit = 200;
    const first = await fetchPage(1, limit);
    const all: Region[] = [...(first.regions || [])];
    const totalPages = first.pagination?.total_pages ?? 1;
    for (let page = 2; page <= totalPages; page++) {
      const next = await fetchPage(page, limit);
      all.push(...(next.regions || []));
    }
    return { regions: all, pagination: first.pagination };
  },

  getVessels: async (): Promise<VesselsResponse> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/shipping_vessels`, {
      method: "GET",
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch vessels");
    }

    return response.json();
  },

  getCompanies: async (): Promise<CompaniesResponse> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/companies`, {
      method: "GET",
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch companies");
    }

    return response.json();
  },

  getPartners: async (): Promise<PartnersResponse> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const fetchPage = async (page: number, limit: number) => {
      const response = await fetch(
        `${API_URL}/api/partners?page=${page}&limit=${limit}`,
        {
          method: "GET",
          headers: getAuthHeaders(token),
        },
      );
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unauthorized. Please login again.");
        }
        const errorText = await response.text();
        throw new Error(errorText || "Failed to fetch partners");
      }
      return response.json() as Promise<PartnersResponse>;
    };

    const limit = 200;
    const first = await fetchPage(1, limit);
    const all: Partner[] = [...(first.partners || [])];
    const totalPages = first.pagination?.total_pages ?? 1;
    for (let page = 2; page <= totalPages; page++) {
      const next = await fetchPage(page, limit);
      all.push(...(next.partners || []));
    }
    return { partners: all, pagination: first.pagination };
  },

  createPartner: async (
    partnerData: CreatePartnerRequest,
  ): Promise<Partner> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/partners`, {
      method: "POST",
      headers: getAuthHeaders(token),
      body: JSON.stringify(partnerData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to create partner");
      } catch (e) {
        if (e instanceof Error && e.message !== "Failed to create partner")
          throw e;
        throw new Error(errorText || "Failed to create partner");
      }
    }

    return response.json();
  },

  updatePartner: async (
    id: number,
    partnerData: UpdatePartnerRequest,
  ): Promise<Partner> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/partners/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(token),
      body: JSON.stringify(partnerData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to update partner");
      } catch (e) {
        if (e instanceof Error && e.message !== "Failed to update partner")
          throw e;
        throw new Error(errorText || "Failed to update partner");
      }
    }

    return response.json();
  },

  getProducts: async (): Promise<ProductsResponse> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/products`, {
      method: "GET",
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch products");
    }

    return response.json();
  },

  getUsers: async (): Promise<UsersResponse> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/users`, {
      method: "GET",
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch users");
    }

    return response.json();
  },

  getCodeBudgets: async (): Promise<CodeBudgetsResponse> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/code-budgets`, {
      method: "GET",
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch code budgets");
    }

    return response.json();
  },

  createOrder: async (
    orderData: CreateOrderRequest,
  ): Promise<PurchaseOrder> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/purchase-orders`, {
      method: "POST",
      headers: getAuthHeaders(token),
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to create order");
    }

    return response.json();
  },

  /**
   * Generate Excel for a purchase order by id.
   * Returns an ArrayBuffer of the XLSX file.
   */
  generateExcel: async (id: number): Promise<ArrayBuffer> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(
      `${API_URL}/api/purchase-orders/${id}/generate-excel`,
      {
        method: "GET",
        headers: getAuthHeaders(token),
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to generate excel");
    }

    return response.arrayBuffer();
  },

  /**
   * Generate PDF for a purchase order by id.
   * Returns an ArrayBuffer of the PDF file.
   */
  generatePdf: async (id: number): Promise<ArrayBuffer> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(
      `${API_URL}/api/purchase-orders/${id}/generate-pdf`,
      {
        method: "GET",
        headers: getAuthHeaders(token),
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to generate PDF");
    }

    return response.arrayBuffer();
  },

  updateOrder: async (
    id: number,
    orderData: UpdateOrderRequest,
  ): Promise<PurchaseOrder> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/purchase-orders/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(token),
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to update order");
    }

    return response.json();
  },

  deleteOrder: async (id: number): Promise<void> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/purchase-orders/${id}`, {
      method: "DELETE",
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to delete order");
      } catch (e) {
        if (e instanceof Error && e.message !== "Failed to delete order")
          throw e;
        throw new Error(errorText || "Failed to delete order");
      }
    }
  },

  cancelOrder: async (id: number): Promise<PurchaseOrder> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(
      `${API_URL}/api/purchase-orders/${id}/cancel`,
      {
        method: "POST",
        headers: getAuthHeaders(token),
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to cancel order");
      } catch (e) {
        if (e instanceof Error && e.message !== "Failed to cancel order")
          throw e;
        throw new Error(errorText || "Failed to cancel order");
      }
    }

    return response.json();
  },

  getOrderById: async (id: number): Promise<PurchaseOrder> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/purchase-orders/${id}`, {
      method: "GET",
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch order");
    }

    return response.json();
  },

  confirmOrder: async (id: number): Promise<PurchaseOrder> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(
      `${API_URL}/api/purchase-orders/${id}/confirm`,
      {
        method: "POST",
        headers: getAuthHeaders(token),
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to confirm order");
      } catch (e) {
        if (e instanceof Error && e.message !== "Failed to confirm order")
          throw e;
        throw new Error(errorText || "Failed to confirm order");
      }
    }

    return response.json();
  },

  draftOrder: async (id: number): Promise<PurchaseOrder> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(
      `${API_URL}/api/purchase-orders/${id}/set-to-draft`,
      {
        method: "POST",
        headers: getAuthHeaders(token),
      },
    );

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to set order to draft");
      } catch (e) {
        if (e instanceof Error && e.message !== "Failed to set order to draft")
          throw e;
        throw new Error(errorText || "Failed to set order to draft");
      }
    }

    return response.json();
  },

  createRegion: async (
    regionData: CreateRegionRequest,
  ): Promise<Region> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/regions`, {
      method: "POST",
      headers: getAuthHeaders(token),
      body: JSON.stringify(regionData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to create region");
      } catch (e) {
        if (e instanceof Error && e.message !== "Failed to create region")
          throw e;
        throw new Error(errorText || "Failed to create region");
      }
    }

    return response.json();
  },

  updateRegion: async (
    id: number,
    regionData: UpdateRegionRequest,
  ): Promise<Region> => {
    const token = tokenManager.getToken();

    if (!token) {
      throw new Error("No access token found");
    }

    const response = await fetch(`${API_URL}/api/regions/${id}`, {
      method: "PUT",
      headers: getAuthHeaders(token),
      body: JSON.stringify(regionData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      try {
        const errorJson = JSON.parse(errorText);
        throw new Error(errorJson.error || "Failed to update region");
      } catch (e) {
        if (e instanceof Error && e.message !== "Failed to update region")
          throw e;
        throw new Error(errorText || "Failed to update region");
      }
    }

    return response.json();
  },
};
