import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient, BILLS_BUCKET, SIGNED_URL_TTL_SECONDS } from "@/lib/supabaseServer";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = getSupabaseServiceClient();

  const { data: bill, error } = await supabase.from("bill_uploads").select("*").eq("id", id).single();
  if (error || !bill) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }

  const { data: signed, error: signedError } = await supabase.storage
    .from(BILLS_BUCKET)
    .createSignedUrl(bill.storage_path, SIGNED_URL_TTL_SECONDS);

  if (signedError) {
    return NextResponse.json({ error: `Could not create signed URL: ${signedError.message}` }, { status: 500 });
  }

  return NextResponse.json({ bill, imageUrl: signed.signedUrl });
}
