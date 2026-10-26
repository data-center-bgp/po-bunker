import { supabase } from "@/lib/supabase";
import { unwrap } from "./helpers";
import type { CodeBudget, Product, Vessel, VesselSyncResult } from "./types";

const VESSEL_SELECT =
  "*, type:type_id(id,name), operator:operator_id(id,name), owner:owner_id(id,name), business_unit:business_unit_id(id,name)";

const PRODUCT_SELECT =
  "*, category:category_id(id,name), uom:uom_id(id,name), code_budget:code_budget_id(id,name)";

export const lookupsService = {
  getVessels: async (): Promise<Vessel[]> =>
    unwrap(
      await supabase
        .from("vessels")
        .select(VESSEL_SELECT)
        .order("name")
        .overrideTypes<Vessel[], { merge: false }>(),
      "Failed to fetch vessels",
    ),

  // Runs the po-bunker-sync-vessels Edge Function (admins only). The SMS API
  // token stays in a Supabase secret; the browser never sees it.
  syncVesselsFromSms: async (): Promise<VesselSyncResult> => {
    const { data, error } = await supabase.functions.invoke(
      "po-bunker-sync-vessels",
      { method: "POST" },
    );
    if (error) {
      let message = "Failed to sync vessels";
      try {
        const body = await (error as { context?: Response }).context?.json();
        if (body?.error) message = String(body.error);
      } catch {
        // keep the generic message
      }
      throw new Error(message);
    }
    return data as VesselSyncResult;
  },

  getProducts: async (): Promise<Product[]> =>
    unwrap(
      await supabase
        .from("products")
        .select(PRODUCT_SELECT)
        .eq("active", true)
        .order("name")
        .overrideTypes<Product[], { merge: false }>(),
      "Failed to fetch products",
    ),

  getCodeBudgets: async (): Promise<CodeBudget[]> =>
    unwrap(
      await supabase
        .from("code_budgets")
        .select("id,name,code,active")
        .eq("active", true)
        .order("name")
        .overrideTypes<CodeBudget[], { merge: false }>(),
      "Failed to fetch code budgets",
    ),

  // People who can be picked as "Requested By" (active app users).
  getRequesters: async (): Promise<{ id: string; name: string }[]> =>
    unwrap(
      await supabase
        .from("profiles")
        .select("id,name")
        .eq("active", true)
        .order("name")
        .overrideTypes<{ id: string; name: string }[], { merge: false }>(),
      "Failed to fetch users",
    ),
};
