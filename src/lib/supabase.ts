import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as
  | string
  | undefined;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Copy .env.example to .env and fill them in.",
  );
}

// The CGA project is shared with other apps, so this app lives in its own
// `po_bunker` schema and uses its own auth storage key.
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  db: { schema: "po_bunker" },
  auth: {
    storageKey: "po-bunker-auth",
    persistSession: true,
    autoRefreshToken: true,
  },
});
