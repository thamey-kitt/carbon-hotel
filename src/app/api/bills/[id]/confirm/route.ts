import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServiceClient } from "@/lib/supabaseServer";
import { activityTypeFor, BillType, OilSubtype } from "@/lib/billSchemas";
import { runChecks } from "@/lib/equationChecker";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);

  if (!body || typeof body !== "object" || !body.fields || typeof body.confirmed_by !== "string" || !body.confirmed_by.trim()) {
    return NextResponse.json({ error: "Body must include `fields` and a non-empty `confirmed_by`" }, { status: 400 });
  }

  const fields: Record<string, unknown> = body.fields;
  const supabase = getSupabaseServiceClient();

  const { data: bill, error: fetchError } = await supabase.from("bill_uploads").select("*").eq("id", id).single();
  if (fetchError || !bill) {
    return NextResponse.json({ error: "Bill not found" }, { status: 404 });
  }
  if (bill.status === "confirmed") {
    return NextResponse.json({ error: "This bill has already been confirmed" }, { status: 409 });
  }

  const billType = bill.bill_type as BillType;
  const oilSubtype = bill.fuel_subtype as OilSubtype | null;
  const checks = runChecks(billType, fields);

  const { periodStart, periodEnd, amount, unit } = deriveLedgerValues(billType, fields);
  if (amount === null || periodStart === null || periodEnd === null) {
    return NextResponse.json(
      { error: "Cannot create a ledger entry: quantity/amount and both dates are required." },
      { status: 400 }
    );
  }

  const ledgerId = crypto.randomUUID();
  const { error: ledgerError } = await supabase.from("ledger").insert({
    id: ledgerId,
    activity_type: activityTypeFor(billType, oilSubtype),
    amount,
    unit,
    period_start: periodStart,
    period_end: periodEnd,
    source: `bill_uploads:${id}`,
    document_id: typeof fields.document_id === "string" ? fields.document_id : null,
    status: "active",
    created_by: body.confirmed_by,
  });

  if (ledgerError) {
    return NextResponse.json({ error: `Failed to write ledger entry: ${ledgerError.message}` }, { status: 500 });
  }

  const { error: updateError } = await supabase
    .from("bill_uploads")
    .update({
      extracted: fields,
      checks,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      confirmed_by: body.confirmed_by,
      ledger_ids: [ledgerId],
    })
    .eq("id", id);

  if (updateError) {
    return NextResponse.json({ error: `Failed to update bill status: ${updateError.message}` }, { status: 500 });
  }

  return NextResponse.json({ ledgerId });
}

function deriveLedgerValues(
  billType: BillType,
  fields: Record<string, unknown>
): { amount: number | null; unit: string; periodStart: string | null; periodEnd: string | null } {
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

  if (billType === "electricity") {
    return {
      amount: num(fields.units_used_kwh),
      unit: "kWh",
      periodStart: str(fields.period_start),
      periodEnd: str(fields.period_end),
    };
  }
  if (billType === "lpg") {
    const date = str(fields.delivery_date);
    return {
      amount: num(fields.quantity),
      unit: (str(fields.unit) as string) ?? "kg",
      periodStart: date,
      periodEnd: date,
    };
  }
  const date = str(fields.delivery_date);
  return {
    amount: num(fields.quantity_liters),
    unit: "liter",
    periodStart: date,
    periodEnd: date,
  };
}
