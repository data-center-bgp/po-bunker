import { api } from "@/lib/api";
import type { BusinessUnit, Company, CompanyInput } from "./types";

export const companiesService = {
  getCompanies: (): Promise<Company[]> => api.get<Company[]>("/companies"),

  createCompany: async (input: CompanyInput): Promise<number> =>
    (await api.post<Company>("/companies", input)).id,

  updateCompany: async (id: number, input: CompanyInput): Promise<void> => {
    await api.put<Company>(`/companies/${id}`, input);
  },

  getBusinessUnits: (): Promise<BusinessUnit[]> =>
    api.get<BusinessUnit[]>("/business-units"),
};
