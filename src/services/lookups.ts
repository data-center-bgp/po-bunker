import { api } from "@/lib/api";
import type { CodeBudget, Product, Vessel, VesselSyncResult } from "./types";

export const lookupsService = {
  getVessels: (): Promise<Vessel[]> => api.get<Vessel[]>("/vessels"),

  // Runs the vessel sync on the server (admins and staff). The SMS API token
  // stays on the server; the browser never sees it.
  syncVesselsFromSms: (): Promise<VesselSyncResult> =>
    api.post<VesselSyncResult>("/vessels/sync"),

  // Active products only: what the order form offers.
  getProducts: (): Promise<Product[]> =>
    api.get<Product[]>("/products", { active: true }),

  getCodeBudgets: (): Promise<CodeBudget[]> =>
    api.get<CodeBudget[]>("/code-budgets", { active: true }),

  // People who can be picked as "Requested By" (active app users).
  getRequesters: (): Promise<{ id: string; name: string }[]> =>
    api.get<{ id: string; name: string }[]>("/requesters"),
};
