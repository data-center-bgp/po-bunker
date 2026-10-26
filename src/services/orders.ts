import { supabase } from "@/lib/supabase";
import { toError, unwrap, unwrapVoid } from "./helpers";
import { storageService } from "./storage";
import type {
  OrderDocument,
  OrderHeaderInput,
  OrderLineInput,
  PurchaseOrder,
  RemarkColor,
} from "./types";

const ORDER_SELECT = `
  *,
  company:companies(id,name,code_company,logo_path),
  partner:partners(id,name,street,city,phone),
  creator:created_by(id,name),
  completer:completed_by(id,name),
  canceller:cancelled_by(id,name),
  remarks:purchase_order_remarks(id,order_id,remark_date,color,remark),
  documents:purchase_order_documents(id,order_id,doc_type,file_path,file_name,mime_type,size_bytes,uploaded_at,uploader:uploaded_by(id,name)),
  lines:purchase_order_lines(
    *,
    product:products(id,name,default_code,merk,model,serial_number,specs),
    vessel:vessels(id,name,code),
    region:regions(id,name),
    uom:uoms(id,name),
    code_budget:code_budgets(id,name),
    category:product_categories(id,name),
    requester:requested_by(id,name)
  )
`;

const BY_LINE_ID = { referencedTable: "purchase_order_lines" } as const;
const BY_REMARK_ID = { referencedTable: "purchase_order_remarks" } as const;
const BY_DOC_ID = { referencedTable: "purchase_order_documents" } as const;

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

const safeFileName = (name: string) =>
  name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "file";

export const ordersService = {
  getOrders: async (page = 1, limit = 10): Promise<OrdersPage> => {
    const from = (page - 1) * limit;
    const { data, error, count } = await supabase
      .from("purchase_orders")
      .select(ORDER_SELECT, { count: "exact" })
      .order("date_order", { ascending: false })
      .order("id", { ascending: false })
      .order("id", BY_LINE_ID)
      .order("id", BY_REMARK_ID)
      .order("id", BY_DOC_ID)
      .range(from, from + limit - 1)
      .overrideTypes<PurchaseOrder[], { merge: false }>();
    if (error) throw toError(error, "Failed to fetch orders");
    return { orders: data ?? [], totalCount: count ?? data?.length ?? 0 };
  },

  getOrderById: async (id: number): Promise<PurchaseOrder> =>
    unwrap(
      await supabase
        .from("purchase_orders")
        .select(ORDER_SELECT)
        .eq("id", id)
        .order("id", BY_LINE_ID)
        .order("id", BY_REMARK_ID)
        .order("id", BY_DOC_ID)
        .single<PurchaseOrder>(),
      "Failed to fetch order",
    ),

  // Submits a new order. A submitted order is locked: to fix a mistake, cancel
  // it and create a new one.
  createOrder: async (
    header: OrderHeaderInput,
    lines: OrderLineInput[],
  ): Promise<number> => {
    const { data, error } = await supabase.rpc("save_purchase_order", {
      p_id: null,
      p_header: header,
      p_lines: lines,
    });
    if (error) throw toError(error, "Failed to create order");
    return (data as { id: number }).id;
  },

  // Needs at least one Delivery Order file and an actual quantity per line.
  completeOrder: async (
    id: number,
    quantities: ActualQuantity[],
  ): Promise<void> => {
    const { error } = await supabase.rpc("complete_purchase_order", {
      p_id: id,
      p_lines: quantities,
    });
    if (error) throw toError(error, "Failed to complete order");
  },

  cancelOrder: async (id: number, reason: string): Promise<void> => {
    const { error } = await supabase.rpc("cancel_purchase_order", {
      p_id: id,
      p_reason: reason,
    });
    if (error) throw toError(error, "Failed to cancel order");
  },

  // --- Delivery Order files (only while the order is submitted) ---------------

  uploadDocument: async (orderId: number, file: File): Promise<void> => {
    if (!DOCUMENT_TYPES.includes(file.type)) {
      throw new Error("Please choose a PDF, JPG or PNG file.");
    }
    if (file.size > DOCUMENT_MAX_BYTES) {
      throw new Error("The file must be smaller than 5 MB.");
    }
    const path = `documents/${orderId}/${Date.now()}-${safeFileName(file.name)}`;
    await storageService.uploadFile(path, file);
    const { error } = await supabase.from("purchase_order_documents").insert({
      order_id: orderId,
      doc_type: "delivery_order",
      file_path: path,
      file_name: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    });
    if (error) {
      await storageService.removeFile(path);
      throw toError(error, "Failed to attach the document");
    }
  },

  deleteDocument: async (doc: OrderDocument): Promise<void> => {
    const { data, error } = await supabase
      .from("purchase_order_documents")
      .delete()
      .eq("id", doc.id)
      .select("id");
    unwrapVoid({ error }, "Failed to delete the document");
    if (!data || data.length === 0) {
      throw new Error("The document can no longer be deleted.");
    }
    await storageService.removeFile(doc.file_path);
  },

  // --- Remarks (any order state) ------------------------------------------------

  addRemark: async (
    orderId: number,
    remark: string,
    color: RemarkColor,
    remarkDate: string,
  ): Promise<void> => {
    unwrapVoid(
      await supabase.from("purchase_order_remarks").insert({
        order_id: orderId,
        remark,
        color,
        remark_date: remarkDate,
      }),
      "Failed to add remark",
    );
  },

  deleteRemark: async (remarkId: number): Promise<void> => {
    const { data, error } = await supabase
      .from("purchase_order_remarks")
      .delete()
      .eq("id", remarkId)
      .select("id");
    unwrapVoid({ error }, "Failed to delete remark");
    if (!data || data.length === 0) {
      throw new Error("The remark could not be deleted.");
    }
  },
};
