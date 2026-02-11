import { API_URL, getAuthHeaders } from "./config";
import { tokenManager } from "./tokenManager";

export interface OrderLine {
  product_id: [number, string]; // [id, name]
  product_qty: number;
  price_unit: number;
  vessel_id: [number, string]; // [id, name]
}

export interface PurchaseOrder {
  id: number;
  name: string; // PO number
  partner_id: [number, string]; // [id, customer name]
  order_type: string;
  date_order: string;
  date_planned: string;
  state: string; // order status
  order_line: OrderLine[];
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

export interface PartnersResponse {
  partners: Partner[];
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

export interface ProductsResponse {
  products: Product[];
}

export interface CreateOrderRequest {
  company_id: number;
  partner_id: number;
  order_type: string;
  date_order: string;
  notes: string;
  picking_type_id: number | null;
  order_lines: {
    product_id: number;
    product_qty: number;
    price_unit: number;
    total_price: number;
    vessel_id: number;
    category_id: number;
    code_budget_id: number | null;
    uom_id: number;
    project: string;
  }[];
}

export const ordersApi = {
  getOrders: async (
    page: number = 1,
    limit: number = 10
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
      }
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

    const response = await fetch(`${API_URL}/api/partners`, {
      method: "GET",
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error("Unauthorized. Please login again.");
      }
      const errorText = await response.text();
      throw new Error(errorText || "Failed to fetch partners");
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

  createOrder: async (
    orderData: CreateOrderRequest
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
};
