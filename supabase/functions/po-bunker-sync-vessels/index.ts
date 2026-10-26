// Edge Function: pull the vessel list from the company SMS API into
// po_bunker.vessels. The API token lives in a Supabase secret
// (VESSEL_API_TOKEN, falling back to API_VESSEL_PMS_BAROKAH) and never reaches
// the browser. Only active PO Bunker admins may run it.
//
// Deploy (CGA is shared; never `db push`):
//   supabase functions deploy po-bunker-sync-vessels --no-verify-jwt --use-api \
//     --project-ref mgxdvnnvruoyhnzgrtur
// JWT verification is done below instead of by the gateway, because CGA uses
// the new publishable API keys.
import { createClient } from "npm:@supabase/supabase-js@2";

const API_URL = "https://sms.barokahmarineconsulting.com/api/csbd/ships";
const MAX_PAGES = 50;
const TIMEOUT_MS = 20_000;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// The sample response was cut off, so follow common pagination shapes.
const nextPageUrl = (body: Record<string, unknown>, page: number): string | null => {
  const links = body.links as Record<string, unknown> | undefined;
  const meta = body.meta as Record<string, unknown> | undefined;
  const candidate =
    (typeof links?.next === "string" && links.next) ||
    (typeof body.next_page_url === "string" && body.next_page_url) ||
    (typeof body.next === "string" && body.next) ||
    null;
  if (candidate) return candidate;
  const current = Number(meta?.current_page ?? page);
  const last = Number(meta?.last_page ?? 0);
  if (last > current) return `${API_URL}?page=${current + 1}`;
  return null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authorization = req.headers.get("Authorization");
  if (!authorization) return json({ error: "Missing authorization" }, 401);

  const url = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !anonKey || !serviceKey) {
    return json({ error: "The function is not configured" }, 500);
  }

  // 1. Who is calling? Only active PO Bunker admins.
  const userClient = createClient(url, anonKey, {
    global: { headers: { Authorization: authorization } },
    db: { schema: "po_bunker" },
    auth: { persistSession: false },
  });
  const { data: isAdmin, error: adminError } = await userClient.rpc("is_admin");
  if (adminError) return json({ error: "Not authenticated" }, 401);
  if (isAdmin !== true) {
    return json({ error: "Only PO Bunker admins can sync vessels" }, 403);
  }

  // 2. Fetch the ships.
  const token =
    Deno.env.get("VESSEL_API_TOKEN") ?? Deno.env.get("API_VESSEL_PMS_BAROKAH");
  if (!token) return json({ error: "The vessel API token is not configured" }, 500);

  const ships: unknown[] = [];
  let next: string | null = API_URL;
  let page = 1;
  let pages = 0;
  try {
    while (next && pages < MAX_PAGES) {
      // Never send the token anywhere but the SMS host.
      if (new URL(next).origin !== new URL(API_URL).origin) {
        return json({ error: "The vessel API returned an unexpected page link" }, 502);
      }
      const res = await fetch(next, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        console.error("SMS vessel API answered HTTP", res.status);
        return json({ error: `The vessel API answered with HTTP ${res.status}` }, 502);
      }
      const body = await res.json();
      const rows = Array.isArray(body) ? body : body?.data;
      if (!Array.isArray(rows)) {
        return json({ error: "Unexpected response from the vessel API" }, 502);
      }
      ships.push(...rows);
      next = Array.isArray(body) ? null : nextPageUrl(body, page);
      page++;
      pages++;
    }
  } catch (err) {
    console.error("SMS vessel API request failed:", err instanceof Error ? err.message : err);
    return json({ error: "Could not reach the vessel API" }, 502);
  }

  // 3. Write them. sync_vessels is callable by service_role only.
  const admin = createClient(url, serviceKey, {
    db: { schema: "po_bunker" },
    auth: { persistSession: false },
  });
  const { data, error } = await admin.rpc("sync_vessels", { p_ships: ships });
  if (error) {
    console.error("sync_vessels failed:", error.message);
    return json({ error: error.message }, 400);
  }
  return json({ ok: true, pages, ...data });
});
