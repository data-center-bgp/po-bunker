// The API answers errors as { error: { code, message, field? } } with stable
// codes. This turns them into the Indonesian text shown to the user.

const MESSAGES: Record<string, string> = {
  invalid_credentials: "Email atau kata sandi salah",
  too_many_attempts: "Terlalu banyak percobaan. Coba lagi beberapa saat lagi.",
  unauthorized: "Sesi telah berakhir, silakan masuk kembali.",
  invalid_token: "Sesi telah berakhir, silakan masuk kembali.",
  forbidden: "Anda tidak memiliki izin untuk tindakan ini.",
  not_found: "Data tidak ditemukan.",
  invalid_request: "Permintaan tidak valid.",
  invalid_value: "Ada isian dengan format atau nilai yang tidak diizinkan.",
  missing_value: "Ada isian wajib yang belum diisi.",
  duplicate: "Data dengan nilai unik yang sama sudah ada.",
  invalid_reference:
    "Data yang dirujuk tidak ada, atau data ini masih digunakan oleh data lain.",
  method_not_allowed: "Tindakan ini tidak didukung.",
  internal_error: "Terjadi kesalahan di server. Coba lagi beberapa saat lagi.",
  network_error:
    "Tidak dapat terhubung ke server. Periksa koneksi internet Anda.",

  // purchase orders
  lines_required: "PO harus memiliki minimal satu baris.",
  discount_exceeds_total: "Diskon lebih besar dari total baris PO.",
  company_code_missing:
    "Perusahaan belum memiliki Kode Umum, yang diperlukan untuk menomori PO bunker. Isi dahulu di halaman Perusahaan.",
  order_not_submitted: "Tindakan ini hanya dapat dilakukan pada PO berstatus Diajukan.",
  do_required: "Unggah Delivery Order (DO) sebelum menyelesaikan PO.",
  actual_qty_required: "Isi kuantitas aktual untuk setiap baris PO.",
  actual_qty_invalid: "Kuantitas aktual tidak boleh negatif.",
  cancel_reason_required: "Alasan pembatalan wajib diisi (minimal 3 karakter).",
  remark_required: "Remark wajib diisi.",

  // files
  file_too_large: "Ukuran file terlalu besar.",
  unsupported_file_type: "Jenis file tidak diizinkan.",
  invalid_path: "Lokasi file tidak valid.",
  invalid_link: "Tautan file tidak valid atau sudah kedaluwarsa.",

  // users
  email_taken: "Email ini sudah memiliki akun.",
  weak_password: "Kata sandi harus 8 sampai 72 karakter.",
  wrong_password: "Kata sandi saat ini salah.",
  cannot_change_self:
    "Anda tidak dapat mengubah peran atau menonaktifkan akun Anda sendiri.",
  last_admin: "Harus selalu ada minimal satu admin aktif.",

  // vessel sync
  sync_in_progress: "Sinkronisasi kapal sedang berjalan.",
  empty_ship_list: "API kapal tidak mengembalikan data kapal, tidak ada yang diubah.",
  no_valid_ships:
    "API kapal tidak mengembalikan kapal yang dapat dipakai (setiap kapal butuh id angka dan nama).",
  vessel_api_not_configured: "Sinkronisasi kapal belum dikonfigurasi di server.",
  vessel_api_unreachable: "API kapal tidak dapat dijangkau.",
  vessel_api_status: "API kapal menjawab dengan galat.",
  vessel_api_unexpected_response: "API kapal memberikan respons yang tidak terduga.",
  vessel_api_bad_link: "API kapal memberikan tautan halaman yang tidak terduga.",
};

const FIELD_LABELS: Record<string, string> = {
  name: "Nama",
  email: "Email",
  password: "Kata sandi",
  role: "Peran",
  active: "Status aktif",
  currency: "Mata uang",
  company_id: "Perusahaan",
  partner_id: "Vendor",
  order_type: "Jenis PO",
  date_order: "Tanggal PO",
  option_order: "Jenis dokumen vendor",
  notes: "Catatan",
  amount_discount: "Diskon",
  tax_percent: "PPN",
  lines: "Baris PO",
  product_id: "Produk",
  vessel_id: "Kapal",
  uom_id: "Satuan",
  product_qty: "Kuantitas",
  price_unit: "Harga satuan",
  priority: "Prioritas",
  requested_by: "Peminta",
  category_id: "Kategori",
  standard_price: "Harga standar",
  list_price: "Harga jual",
  is_company: "Perusahaan",
  is_supplier: "Vendor",
  is_customer: "Customer",
  reason: "Alasan",
  remark: "Remark",
  color: "Warna",
  remark_date: "Tanggal remark",
  code: "Kode",
};

const RULES: [RegExp, string][] = [
  [/is required and must not be negative/, "wajib diisi dan tidak boleh negatif"],
  [/is required/, "wajib diisi"],
  [/must be greater than 0/, "harus lebih dari 0"],
  [/must not be negative/, "tidak boleh negatif"],
  [/is not a valid email/, "bukan alamat email yang valid"],
  [/is not a valid user id/, "bukan pengguna yang valid"],
  [/is too long|has too many entries/, "terlalu panjang atau terlalu banyak"],
  [/must be a 3-letter code/, "harus berupa kode 3 huruf, misalnya IDR"],
  [/must be between 0 and 100/, "harus antara 0 dan 100"],
  [/must be between 0 and/, "berada di luar batas yang diizinkan"],
  [/must be (admin, staff or viewer|low, medium or high|quotation or invoice|merah or biru|bunker_fuel)/, "memiliki nilai yang tidak diizinkan"],
  [/must be a date/, "harus berupa tanggal yang valid"],
];

// "lines[2].product_qty" -> "Baris 3: Kuantitas"
const fieldLabel = (field: string): string => {
  const line = /^lines\[(\d+)\]\.(\w+)$/.exec(field);
  if (line) {
    return `Baris ${Number(line[1]) + 1}: ${FIELD_LABELS[line[2]] ?? line[2]}`;
  }
  return FIELD_LABELS[field] ?? field;
};

export const describeApiError = (
  code: string,
  field: string | undefined,
  serverMessage: string,
): string => {
  if (code === "validation_failed" && field) {
    const rule = RULES.find(([pattern]) => pattern.test(serverMessage));
    return `${fieldLabel(field)} ${rule ? rule[1] : "tidak valid"}`;
  }
  if (code === "discount_exceeds_total") {
    // keep the amounts the server mentions
    const amounts = /\(([^)]*)\).*\(([^)]*)\)/.exec(serverMessage);
    if (amounts) {
      return `Diskon (${amounts[1]}) lebih besar dari total baris PO (${amounts[2]}).`;
    }
  }
  return MESSAGES[code] ?? serverMessage;
};
