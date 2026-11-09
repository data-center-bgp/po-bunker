import { api } from "@/lib/api";
import type { Partner, PartnerInput } from "./types";

export const partnersService = {
  getPartners: (): Promise<Partner[]> => api.get<Partner[]>("/partners"),

  createPartner: async (input: PartnerInput): Promise<void> => {
    await api.post<Partner>("/partners", input);
  },

  updatePartner: async (id: number, input: PartnerInput): Promise<void> => {
    await api.put<Partner>(`/partners/${id}`, input);
  },
};
