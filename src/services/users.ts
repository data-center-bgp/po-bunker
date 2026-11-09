import { api } from "@/lib/api";
import type { AppUser, UserRole } from "./types";

// Admin only. Users are created here with a starting password; they can change
// it from the account menu, and an admin can reset it.
export const usersService = {
  getUsers: (): Promise<AppUser[]> => api.get<AppUser[]>("/users"),

  createUser: async (input: {
    email: string;
    name: string;
    role: UserRole;
    password: string;
  }): Promise<void> => {
    await api.post<AppUser>("/users", input);
  },

  updateUser: async (
    id: string,
    input: { name: string; role: UserRole; active: boolean },
  ): Promise<void> => {
    await api.put<AppUser>(`/users/${id}`, input);
  },

  resetPassword: (id: string, password: string): Promise<void> =>
    api.post<void>(`/users/${id}/reset-password`, { password }),
};
