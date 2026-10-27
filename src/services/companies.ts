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
      "Gagal memuat data perusahaan",
    ),

  createCompany: async (input: CompanyInput): Promise<number> => {
    const row = unwrap(
      await supabase
        .from("companies")
        .insert(input)
        .select("id")
        .single<{ id: number }>(),
      "Gagal membuat perusahaan",
    );
    return row.id;
  },

  setLogo: async (id: number, logoPath: string): Promise<void> => {
    unwrap(
      await supabase
        .from("companies")
        .update({ logo_path: logoPath })
        .eq("id", id)
        .select("id")
        .single(),
      "Gagal menyimpan logo perusahaan",
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
      "Gagal memperbarui perusahaan",
    );
  },

  getBusinessUnits: async (): Promise<BusinessUnit[]> =>
    unwrap(
      await supabase
        .from("business_units")
        .select("id,name,code")
        .order("name")
        .overrideTypes<BusinessUnit[], { merge: false }>(),
      "Gagal memuat unit bisnis",
    ),
};
