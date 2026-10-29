import { supabase } from "@/lib/supabase";
import { toError } from "./helpers";
import type { AppUser, UserRole } from "./types";

// Admin-only. Logins live in the shared Supabase Auth; these calls only manage
// who may use PO Bunker (po_bunker.profiles), see migration 0008.
export const usersService = {
  getUsers: async (): Promise<AppUser[]> => {
    const { data, error } = await supabase.rpc("admin_list_users");
    if (error) throw toError(error, "Gagal memuat data pengguna");
    return (data ?? []) as AppUser[];
  },

  // Gives an existing CGA login access to PO Bunker.
  addUser: async (input: {
    email: string;
    name: string;
    role: UserRole;
  }): Promise<void> => {
    const { error } = await supabase.rpc("add_user_by_email", {
      p_email: input.email,
      p_name: input.name,
      p_role: input.role,
    });
    if (error) throw toError(error, "Gagal menambahkan pengguna");
  },

  updateUser: async (
    id: string,
    input: { name: string; role: UserRole; active: boolean },
  ): Promise<void> => {
    const { error } = await supabase.rpc("update_user", {
      p_id: id,
      p_name: input.name,
      p_role: input.role,
      p_active: input.active,
    });
    if (error) throw toError(error, "Gagal memperbarui pengguna");
  },
};
