import { api, apiUrl } from "@/lib/api";
import type { Company } from "./types";

const LOGO_TYPES = ["image/png", "image/jpeg"];
const MAX_LOGO_BYTES = 1024 * 1024;

interface FileLink {
  url: string;
  expires_at: string;
}

export const storageService = {
  // Uploads the company logo / letterhead (PNG or JPG, under 1 MB). The server
  // stores the file, saves its path on the company and removes the old file.
  uploadCompanyLogo: async (companyId: number, file: File): Promise<string> => {
    if (!LOGO_TYPES.includes(file.type)) {
      throw new Error("Pilih gambar PNG atau JPG.");
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new Error("Ukuran gambar harus kurang dari 1 MB.");
    }
    const company = await api.upload<Company>(
      "PUT",
      `/companies/${companyId}/logo`,
      file,
    );
    return company.logo_path ?? "";
  },

  // A link that works without a login for an hour (for <img>, <iframe>, PDFs).
  getSignedUrl: async (path: string): Promise<string | null> => {
    try {
      const link = await api.get<FileLink>("/file-url", { path });
      return apiUrl(link.url);
    } catch {
      return null;
    }
  },

  // Images embedded into the PDF / Excel need their bytes, not a URL.
  getDataUrl: async (path: string): Promise<string | null> => {
    const url = await storageService.getSignedUrl(path);
    if (!url) return null;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const blob = await res.blob();
      return await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(blob);
      });
    } catch {
      return null;
    }
  },
};
