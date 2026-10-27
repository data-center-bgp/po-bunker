import { supabase } from "@/lib/supabase";
import { toError } from "./helpers";
import type { OrderState, OrderType } from "./types";

// A slim read of every order with its lines, enough for the dashboard totals.
// Orders are few (a handful per day), so everything is aggregated in the
// browser instead of adding report views to the database.
const DASHBOARD_SELECT = `
  id,name,state,order_type,date_order,date_bunker,completed_at,cancelled_at,
  amount_total,actual_amount,
  partner:partners(id,name),
  company:companies(id,name),
  lines:purchase_order_lines(
    id,product_qty,actual_qty,price_subtotal,actual_subtotal,
    product:products(id,name),
    vessel:vessels(id,name),
    uom:uoms(id,name)
  )
`;

const PAGE_SIZE = 1000;

export interface DashboardLine {
  id: number;
  product_qty: number;
  actual_qty: number | null;
  price_subtotal: number;
  actual_subtotal: number | null;
  product: { id: number; name: string } | null;
  vessel: { id: number; name: string } | null;
  uom: { id: number; name: string } | null;
}

export interface DashboardOrder {
  id: number;
  name: string;
  state: OrderState;
  order_type: OrderType;
  date_order: string;
  date_bunker: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  amount_total: number;
  actual_amount: number | null;
  partner: { id: number; name: string } | null;
  company: { id: number; name: string } | null;
  lines: DashboardLine[];
}

export const dashboardService = {
  getOrders: async (): Promise<DashboardOrder[]> => {
    const orders: DashboardOrder[] = [];
    for (let from = 0; ; from += PAGE_SIZE) {
      const { data, error } = await supabase
        .from("purchase_orders")
        .select(DASHBOARD_SELECT)
        .order("date_order", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
        .overrideTypes<DashboardOrder[], { merge: false }>();
      if (error) throw toError(error, "Gagal memuat data dashboard");
      orders.push(...(data ?? []));
      if (!data || data.length < PAGE_SIZE) break;
    }
    return orders;
  },
};
