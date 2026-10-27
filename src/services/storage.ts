import { supabase } from "@/lib/supabase";
import { translateMessage } from "./helpers";

// Private bucket with company logos and Delivery Order files (migrations 0005
// and 0007).
const BUCKET = "po_bunker_assets";
const LOGO_TYPES = ["image/png", "image/jpeg"];
const MAX_LOGO_BYTES = 1024 * 1024;

export const storageService = {
  uploadFile: async (path: string, file: File): Promise<void> => {
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw new Error(translateMessage(error.message));
  },

  removeFile: async (path: string): Promise<void> => {
    await supabase.storage.from(BUCKET).remove([path]);
  },

  // Each upload gets a new file name, so an old logo is never overwritten.
  uploadCompanyLogo: async (companyId: number, file: File): Promise<string> => {
    if (!LOGO_TYPES.includes(file.type)) {
      throw new Error("Pilih gambar PNG atau JPG.");
    }
    if (file.size > MAX_LOGO_BYTES) {
      throw new Error("Ukuran gambar harus kurang dari 1 MB.");
    }
    const path = `logos/${companyId}/${Date.now()}.${file.type === "image/png" ? "png" : "jpg"}`;
    await storageService.uploadFile(path, file);
    return path;
  },

  getSignedUrl: async (path: string, seconds = 3600): Promise<string | null> => {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, seconds);
    return error ? null : data.signedUrl;
  },

  // Images embedded into the PDF / Excel need their bytes, not a URL.
  getDataUrl: async (path: string): Promise<string | null> => {
    const { data, error } = await supabase.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(data);
    });
  },
};
