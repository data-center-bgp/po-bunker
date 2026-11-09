import { api } from "@/lib/api";
import type {
  OrderDocument,
  OrderHeaderInput,
  OrderLineInput,
  OrderRemark,
  PurchaseOrder,
  RemarkColor,
} from "./types";

export const DOCUMENT_TYPES = ["application/pdf", "image/png", "image/jpeg"];
export const DOCUMENT_MAX_BYTES = 5 * 1024 * 1024;

export interface OrdersPage {
  orders: PurchaseOrder[];
  totalCount: number;
}

export interface ActualQuantity {
  line_id: number;
  actual_qty: number;
}

export const ordersService = {
  getOrders: async (page = 1, limit = 10): Promise<OrdersPage> => {
    const res = await api.get<{ orders: PurchaseOrder[]; total_count: number }>(
      "/orders",
      { page, limit },
    );
    return { orders: res.orders, totalCount: res.total_count };
  },

  getOrderById: (id: number): Promise<PurchaseOrder> =>
    api.get<PurchaseOrder>(`/orders/${id}`),

  // Submits a new order. A submitted order is locked: to fix a mistake, cancel
  // it and create a new one.
  createOrder: async (
    header: OrderHeaderInput,
    lines: OrderLineInput[],
  ): Promise<number> =>
    (await api.post<PurchaseOrder>("/orders", { ...header, lines })).id,

  // Needs at least one Delivery Order file and an actual quantity per line.
  completeOrder: async (
    id: number,
    quantities: ActualQuantity[],
  ): Promise<void> => {
    await api.post<PurchaseOrder>(`/orders/${id}/complete`, {
      lines: quantities,
    });
  },

  cancelOrder: async (id: number, reason: string): Promise<void> => {
    await api.post<PurchaseOrder>(`/orders/${id}/cancel`, { reason });
  },

  // --- Delivery Order files (only while the order is submitted) ---------------

  uploadDocument: async (orderId: number, file: File): Promise<void> => {
    if (!DOCUMENT_TYPES.includes(file.type)) {
      throw new Error("Pilih file PDF, JPG, atau PNG.");
    }
    if (file.size > DOCUMENT_MAX_BYTES) {
      throw new Error("Ukuran file harus kurang dari 5 MB.");
    }
    await api.upload<OrderDocument>("POST", `/orders/${orderId}/documents`, file);
  },

  deleteDocument: async (doc: OrderDocument): Promise<void> => {
    await api.delete<void>(`/orders/${doc.order_id}/documents/${doc.id}`);
  },

  // --- Remarks (any order state) ------------------------------------------------

  addRemark: async (
    orderId: number,
    remark: string,
    color: RemarkColor,
    remarkDate: string,
  ): Promise<void> => {
    await api.post<OrderRemark>(`/orders/${orderId}/remarks`, {
      remark,
      color,
      remark_date: remarkDate,
    });
  },

  deleteRemark: async (orderId: number, remarkId: number): Promise<void> => {
    await api.delete<void>(`/orders/${orderId}/remarks/${remarkId}`);
  },
};
