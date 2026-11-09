import { api } from "@/lib/api";
import type { Region, RegionInput } from "./types";

export const regionsService = {
  getRegions: (): Promise<Region[]> => api.get<Region[]>("/regions"),

  createRegion: async (input: RegionInput): Promise<void> => {
    await api.post<Region>("/regions", input);
  },

  updateRegion: async (id: number, input: RegionInput): Promise<void> => {
    await api.put<Region>(`/regions/${id}`, input);
  },
};
