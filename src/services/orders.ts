import { supabase } from "@/lib/supabase";
import { toError, unwrap, unwrapVoid } from "./helpers";
import type {
  OrderHeaderInput,
  OrderLineInput,
  OrderState,
  ApprovalLevel,
  LineStatus,
  RemarkColor,
  PurchaseOrder,
} from "./types";

const ORDER_SELECT = `
  *,
  company:companies(id,name,code_company,logo_path),
  partner:partners(id,name,street,city,phone),
  creator:created_by(id,name),
  first_approver:first_approved_by(id,name),
  second_approver:second_approved_by(id,name),
  third_approver:third_approved_by(id,name),
  remarks:purchase_order_remarks(id,order_id,remark_date,color,remark),
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

export interface OrdersPage {
  orders: PurchaseOrder[];
  totalCount: number;
}

type StateRpc =
  | "confirm_purchase_order"
  | "cancel_purchase_order"
  | "set_purchase_order_draft";

const changeState = async (
  rpc: StateRpc,
  id: number,
  fallback: string,
): Promise<void> => {
  const { error } = await supabase.rpc(rpc, { p_id: id });
  if (error) throw toError(error, fallback);
};

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
        .single<PurchaseOrder>(),
      "Failed to fetch order",
    ),

  // Create (id = null) or edit a draft. Header and lines are saved atomically
  // by the save_purchase_order function; lines missing from `lines` are removed.
  saveOrder: async (
    id: number | null,
    header: OrderHeaderInput,
    lines: OrderLineInput[],
  ): Promise<number> => {
    const { data, error } = await supabase.rpc("save_purchase_order", {
      p_id: id,
      p_header: header,
      p_lines: lines,
    });
    if (error) {
      throw toError(
        error,
        id ? "Failed to update order" : "Failed to create order",
      );
    }
    return (data as { id: number }).id;
  },

  confirmOrder: (id: number) =>
    changeState("confirm_purchase_order", id, "Failed to confirm order"),

  cancelOrder: (id: number) =>
    changeState("cancel_purchase_order", id, "Failed to cancel order"),

  draftOrder: (id: number) =>
    changeState("set_purchase_order_draft", id, "Failed to set order to draft"),

  // Confirmed orders only. Copies the caller's current signature onto the PO.
  approveOrder: async (id: number, level: ApprovalLevel): Promise<void> => {
    const { error } = await supabase.rpc("approve_purchase_order", {
      p_id: id,
      p_level: level,
    });
    if (error) throw toError(error, "Failed to approve order");
  },

  setLineStatus: async (lineId: number, status: LineStatus): Promise<void> => {
    const { error } = await supabase.rpc("set_line_status", {
      p_line_id: lineId,
      p_status: status,
    });
    if (error) throw toError(error, "Failed to change line status");
  },

  // Remarks can be added and changed in any order state.
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

  // Only draft or cancelled orders can be deleted; a confirmed order is
  // cancelled first.
  deleteOrder: async (id: number): Promise<void> => {
    const { state } = unwrap(
      await supabase
        .from("purchase_orders")
        .select("state")
        .eq("id", id)
        .single<{ state: OrderState }>(),
      "Failed to fetch order",
    );
    if (state === "purchase" || state === "to approve") {
      await changeState("cancel_purchase_order", id, "Failed to cancel order");
    }
    const { data, error } = await supabase
      .from("purchase_orders")
      .delete()
      .eq("id", id)
      .select("id");
    unwrapVoid({ error }, "Failed to delete order");
    if (!data || data.length === 0) {
      throw new Error("This order cannot be deleted in its current state.");
    }
  },
};
