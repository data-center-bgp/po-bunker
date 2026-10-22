import { supabase } from "@/lib/supabase";
import { unwrap } from "./helpers";
import type { Partner, PartnerInput } from "./types";

const PARTNER_SELECT =
  "*, parent:parent_id(id,name), vessel:vessel_id(id,name)";

export const partnersService = {
  getPartners: async (): Promise<Partner[]> =>
    unwrap(
      await supabase
        .from("partners")
        .select(PARTNER_SELECT)
        .order("name")
        .overrideTypes<Partner[], { merge: false }>(),
      "Failed to fetch partners",
    ),

  createPartner: async (input: PartnerInput): Promise<void> => {
    unwrap(
      await supabase.from("partners").insert(input).select("id").single(),
      "Failed to create partner",
    );
  },

  updatePartner: async (id: number, input: PartnerInput): Promise<void> => {
    unwrap(
      await supabase
        .from("partners")
        .update(input)
        .eq("id", id)
        .select("id")
        .single(),
      "Failed to update partner",
    );
  },
};
