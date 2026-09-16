import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSupabaseServiceClient, BILLS_BUCKET } from "@/lib/supabaseServer";
import { BillType, coerceExtractedFields } from "@/lib/billSchemas";
import { runTyphoonOcr } from "@/lib/typhoon";
import { extractStructuredFields } from "@/lib/openrouter";
import { runChecks } from "@/lib/equationChecker";

const VALID_BILL_TYPES: BillType[] = ["electricity", "lpg", "oil"];

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file");
  const billType = formData.get("bill_type");
  const fuelSubtype = formData.get("fuel_subtype");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (typeof billType !== "string" || !VALID_BILL_TYPES.includes(billType as BillType)) {
    return NextResponse.json({ error: "bill_type must be one of electricity, lpg, oil" }, { status: 400 });
  }

  const supabase = getSupabaseServiceClient();
  const id = randomUUID();
  const ext = file.name.split(".").pop() || "bin";
  const storagePath = `${id}/${file.name || `bill.${ext}`}`;

  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(BILLS_BUCKET)
    .upload(storagePath, buffer, { contentType: file.type || "application/octet-stream" });

  if (uploadError) {
    return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
  }

  const { error: insertError } = await supabase.from("bill_uploads").insert({
    id,
    bill_type: billType,
    fuel_subtype: typeof fuelSubtype === "string" && fuelSubtype ? fuelSubtype : null,
    storage_path: storagePath,
    original_filename: file.name,
    status: "pending_ocr",
  });

  if (insertError) {
    return NextResponse.json({ error: `Database insert failed: ${insertError.message}` }, { status: 500 });
  }

  // Run OCR inline, in two stages. For a first bill or two this is fine
  // to await; if this becomes slow, move it to a background job later.
  const base64Image = buffer.toString("base64");

  const typhoonResult = await runTyphoonOcr({
    base64Image,
    mimeType: file.type || "image/jpeg",
  });

  let extractionResult: Awaited<ReturnType<typeof extractStructuredFields>> | null = null;
  if (typhoonResult.markdown) {
    extractionResult = await extractStructuredFields({
      documentText: typhoonResult.markdown,
      billType: billType as BillType,
    });
  }

  const ocrError = typhoonResult.error ?? extractionResult?.error ?? null;
  const extracted = coerceExtractedFields(billType as BillType, extractionResult?.json ?? null);
  const checks = ocrError ? [] : runChecks(billType as BillType, extracted);

  const { error: updateError } = await supabase
    .from("bill_uploads")
    .update({
      ocr_markdown: typhoonResult.markdown,
      ocr_raw: { typhoon: typhoonResult.raw, extraction: extractionResult?.raw ?? null },
      extracted,
      checks,
      status: ocrError ? "ocr_failed" : "pending_confirm",
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: `Failed to save OCR result: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ id, ocrError });
}
