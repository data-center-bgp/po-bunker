import { supabase } from "@/lib/supabase";
import { toError, unwrap, unwrapVoid } from "./helpers";
import type {
  OrderHeaderInput,
  OrderLineInput,
  OrderState,
  PurchaseOrder,
} from "./types";

const ORDER_SELECT = `
  *,
  company:companies(id,name,code_company),
  partner:partners(id,name),
  first_approver:first_approved_by(id,name),
  lines:purchase_order_lines(
    *,
    product:products(id,name,default_code),
    vessel:vessels(id,name),
    region:regions(id,name),
    uom:uoms(id,name),
    code_budget:code_budgets(id,name),
    category:product_categories(id,name),
    requester:requested_by(id,name)
  )
`;

const BY_LINE_ID = { referencedTable: "purchase_order_lines" } as const;

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
