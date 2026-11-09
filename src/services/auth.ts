import { api, setAccessToken, type ApiSession } from "@/lib/api";

export const authService = {
  // Changes the signed-in user's password. Their other sessions end; this one
  // continues with the fresh tokens the server returns.
  changePassword: async (
    currentPassword: string,
    newPassword: string,
  ): Promise<void> => {
    const session = await api.post<ApiSession>("/auth/change-password", {
      current_password: currentPassword,
      new_password: newPassword,
    });
    setAccessToken(session.access_token);
  },
};
