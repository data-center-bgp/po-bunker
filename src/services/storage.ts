import { supabase } from "@/lib/supabase";
import { toError } from "./helpers";

// Private bucket with PO signatures and company logos (see migration 0005).
const BUCKET = "po_bunker_assets";
const ALLOWED_TYPES = ["image/png", "image/jpeg"];
const MAX_BYTES = 1024 * 1024;

const extensionOf = (file: File) => (file.type === "image/png" ? "png" : "jpg");

const checkImage = (file: File) => {
  if (!ALLOWED_TYPES.includes(file.type)) {
    throw new Error("Please choose a PNG or JPG image.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("The image must be smaller than 1 MB.");
  }
};

const upload = async (path: string, file: File): Promise<void> => {
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type, upsert: false });
  if (error) throw new Error(error.message);
};

export const storageService = {
  // Each upload gets a new file name, so a signature copied onto an approved PO
  // is never overwritten by a later upload.
  uploadSignature: async (userId: string, file: File): Promise<string> => {
    checkImage(file);
    const path = `signatures/${userId}/${Date.now()}.${extensionOf(file)}`;
    await upload(path, file);
    const { error } = await supabase.rpc("set_my_signature", { p_path: path });
    if (error) throw toError(error, "Failed to save your signature");
    return path;
  },

  uploadCompanyLogo: async (companyId: number, file: File): Promise<string> => {
    checkImage(file);
    const path = `logos/${companyId}/${Date.now()}.${extensionOf(file)}`;
    await upload(path, file);
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
