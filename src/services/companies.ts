import { supabase } from "@/lib/supabase";
import { unwrap } from "./helpers";
import type { BusinessUnit, Company, CompanyInput } from "./types";

const COMPANY_SELECT =
  "*, region:regions(id,name,code), business_unit:business_units(id,name,code)";

export const companiesService = {
  getCompanies: async (): Promise<Company[]> =>
    unwrap(
      await supabase
        .from("companies")
        .select(COMPANY_SELECT)
        .order("name")
        .overrideTypes<Company[], { merge: false }>(),
      "Failed to fetch companies",
    ),

  createCompany: async (input: CompanyInput): Promise<void> => {
    unwrap(
      await supabase.from("companies").insert(input).select("id").single(),
      "Failed to create company",
    );
  },

  updateCompany: async (id: number, input: CompanyInput): Promise<void> => {
    unwrap(
      await supabase
        .from("companies")
        .update(input)
        .eq("id", id)
        .select("id")
        .single(),
      "Failed to update company",
    );
  },

  getBusinessUnits: async (): Promise<BusinessUnit[]> =>
    unwrap(
      await supabase
        .from("business_units")
        .select("id,name,code")
        .order("name")
        .overrideTypes<BusinessUnit[], { merge: false }>(),
      "Failed to fetch business units",
    ),
};
