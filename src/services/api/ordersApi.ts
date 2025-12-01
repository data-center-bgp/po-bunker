import { API_URL, getAuthHeaders } from './config';
import { tokenManager } from './tokenManager';

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

export interface Partner {
  id: number;
  name: string;
}

export interface PartnersResponse {
  partners: Partner[];
}

export interface Product {
  id: number;
  name: string;
}

export interface ProductsResponse {
  products: Product[];
}

export interface CreateOrderRequest {
  partner_id: number;
  order_type: string;
  date_order: string;
  date_planned: string;
  order_lines: {
    product_id: number;
    product_qty: number;
    price_unit: number;
    vessel_id: number;
  }[];
}

export const ordersApi = {
  getOrders: async (page: number = 1, limit: number = 10): Promise<PurchaseOrdersResponse> => {
    const token = tokenManager.getToken();
    
    if (!token) {
      throw new Error('No access token found');
    }

    const response = await fetch(`${API_URL}/api/purchase-orders?page=${page}&limit=${limit}`, {
      method: 'GET',
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please login again.');
      }
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to fetch orders');
    }

    return response.json();
  },

  getVessels: async (): Promise<VesselsResponse> => {
    const token = tokenManager.getToken();
    
    if (!token) {
      throw new Error('No access token found');
    }

    const response = await fetch(`${API_URL}/api/shipping_vessels`, {
      method: 'GET',
      headers: getAuthHeaders(token),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please login again.');
      }
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to fetch vessels');
    }

    return response.json();
  },

  createOrder: async (orderData: CreateOrderRequest): Promise<PurchaseOrder> => {
    const token = tokenManager.getToken();
    
    if (!token) {
      throw new Error('No access token found');
    }

    const response = await fetch(`${API_URL}/api/purchase-orders`, {
      method: 'POST',
      headers: getAuthHeaders(token),
      body: JSON.stringify(orderData),
    });

    if (!response.ok) {
      if (response.status === 401) {
        throw new Error('Unauthorized. Please login again.');
      }
      const errorText = await response.text();
      throw new Error(errorText || 'Failed to create order');
    }

    return response.json();
  },
};