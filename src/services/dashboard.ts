import { api } from "@/lib/api";
import type { OrderState, OrderType } from "./types";

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

// A slim read of every order with its lines, enough for the dashboard totals.
// Orders are few, so everything is aggregated in the browser.
export const dashboardService = {
  getOrders: (): Promise<DashboardOrder[]> =>
    api.get<DashboardOrder[]>("/dashboard/orders"),
};
