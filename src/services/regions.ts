import { supabase } from "@/lib/supabase";
import { unwrap } from "./helpers";
import type { Region, RegionInput } from "./types";

export const regionsService = {
  getRegions: async (): Promise<Region[]> =>
    unwrap(
      await supabase
        .from("regions_view")
        .select("*")
        .order("name")
        .overrideTypes<Region[], { merge: false }>(),
      "Failed to fetch regions",
    ),

  createRegion: async (input: RegionInput): Promise<void> => {
    unwrap(
      await supabase.from("regions").insert(input).select("id").single(),
      "Failed to create region",
    );
  },

  updateRegion: async (id: number, input: RegionInput): Promise<void> => {
    unwrap(
      await supabase
        .from("regions")
        .update(input)
        .eq("id", id)
        .select("id")
        .single(),
      "Failed to update region",
    );
  },
};
