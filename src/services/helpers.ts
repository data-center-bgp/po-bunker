import type { PostgrestError } from "@supabase/supabase-js";

// The database and the Edge Function answer in English; the UI is Indonesian.
const KNOWN_MESSAGES: [RegExp, (m: RegExpMatchArray) => string][] = [
  [/^Not allowed$/i, () => "Anda tidak memiliki izin untuk tindakan ini."],
  [/row-level security/i, () => "Anda tidak memiliki izin untuk tindakan ini."],
  [/JWT expired|Not authenticated|Missing authorization/i, () => "Sesi telah berakhir, silakan masuk kembali."],
  [/Failed to fetch|NetworkError|Load failed/i, () => "Tidak dapat terhubung ke server. Periksa koneksi internet Anda."],
  [/^Order header is required/, () => "Data header PO wajib diisi."],
  [/^Order lines must be an array/, () => "Data baris PO tidak valid."],
  [/^An order needs at least one line/, () => "PO harus memiliki minimal satu baris."],
  [/^A submitted order cannot be edited/, () => "PO yang sudah diajukan tidak dapat diubah. Batalkan PO tersebut lalu buat PO baru."],
  [/^Order .* not found/, () => "PO tidak ditemukan."],
  [/^Line .* does not belong to order/, () => "Baris tersebut bukan bagian dari PO ini."],
  [/^The discount \((.*)\) is larger than the order total \((.*)\)/, (m) => `Diskon (${m[1]}) lebih besar dari total PO (${m[2]}).`],
  [/^The actual quantities are required/, () => "Kuantitas aktual wajib diisi."],
  [/^Enter the actual quantity for every line/, () => "Isi kuantitas aktual untuk setiap baris PO."],
  [/^The actual quantity must be zero or more/, () => "Kuantitas aktual tidak boleh negatif."],
  [/^Upload the Delivery Order/, () => "Unggah Delivery Order (DO) sebelum menyelesaikan PO."],
  [/^Only submitted orders can be completed/, () => "Hanya PO berstatus Diajukan yang dapat diselesaikan."],
  [/^Only submitted orders can be cancelled/, () => "Hanya PO berstatus Diajukan yang dapat dibatalkan."],
  [/^A cancellation reason is required/, () => "Alasan pembatalan wajib diisi."],
  [/^Only PO Bunker admins can sync vessels/, () => "Hanya admin PO Bunker yang dapat menyinkronkan kapal."],
  [/^The vessel API token is not configured|^The function is not configured/, () => "Sinkronisasi kapal belum dikonfigurasi di server."],
  [/^The vessel API answered with HTTP (\d+)/, (m) => `API kapal menjawab dengan HTTP ${m[1]}.`],
  [/^(Unexpected response from the vessel API|The vessel API returned an unexpected page link)/, () => "API kapal memberikan respons yang tidak terduga."],
  [/^Could not reach the vessel API/, () => "API kapal tidak dapat dijangkau."],
  [/^No CGA login exists for this email/, () => "Email ini belum memiliki akun login CGA. Buat akun login di Supabase terlebih dahulu."],
  [/^This user already has access to PO Bunker/, () => "Pengguna ini sudah memiliki akses ke PO Bunker."],
  [/^You cannot change your own role or deactivate yourself/, () => "Anda tidak dapat mengubah peran atau menonaktifkan akun Anda sendiri."],
  [/^Cannot remove or demote the last active admin/, () => "Harus selalu ada minimal satu admin aktif."],
  [/^A name is required/, () => "Nama wajib diisi."],
  [/^An email is required/, () => "Email wajib diisi."],
  [/^Unknown role/, () => "Peran tidak dikenal."],
  [/^User .* not found/, () => "Pengguna tidak ditemukan."],
  [/^The ship list has no valid entries/, () => "Daftar kapal dari API tidak memiliki data yang valid."],
];

export const translateMessage = (message: string): string => {
  for (const [pattern, render] of KNOWN_MESSAGES) {
    const match = message.match(pattern);
    if (match) return render(match);
  }
  return message;
};

// Supabase returns errors as plain objects; the UI expects `Error` instances.
export const toError = (error: PostgrestError, fallback: string): Error => {
  if (error.code === "23505") {
    return new Error("Data dengan nilai unik yang sama sudah ada.");
  }
  if (error.code === "23503") {
    return new Error("Data ini masih digunakan oleh data lain.");
  }
  return new Error(translateMessage(error.message) || fallback);
};

export const unwrap = <T>(
  result: { data: T | null; error: PostgrestError | null },
  fallback: string,
): T => {
  if (result.error) throw toError(result.error, fallback);
  if (result.data === null) throw new Error(fallback);
  return result.data;
};

export const unwrapVoid = (
  result: { error: PostgrestError | null },
  fallback: string,
): void => {
  if (result.error) throw toError(result.error, fallback);
};
