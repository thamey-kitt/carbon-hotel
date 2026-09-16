import "server-only";
import { createClient } from "@supabase/supabase-js";

// Server-only client using the service_role key. This must never be
// imported from a client component or exposed to the browser -- it
// bypasses Row Level Security entirely, which is why the browser talks
// only to our API routes and never straight to Supabase.
export function getSupabaseServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase is not configured yet. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
  });
}

export const BILLS_BUCKET = "bills";
export const SIGNED_URL_TTL_SECONDS = 60 * 10; // 10 minutes
