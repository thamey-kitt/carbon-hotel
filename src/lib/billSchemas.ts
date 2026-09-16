import { z } from "zod";

export type BillType = "electricity" | "lpg" | "oil";
export type OilSubtype = "diesel" | "fuel_oil_a" | "fuel_oil_c";

// Maps a bill's (type, subtype) to the activity_type used in the
// ledger and emission_factors tables. Keep this in sync with the
// activity names used when seeding emission_factors from the TGO doc.
export function activityTypeFor(billType: BillType, oilSubtype?: OilSubtype | null): string {
  if (billType === "electricity") return "electricity_grid";
  if (billType === "lpg") return "lpg";
  return oilSubtype ?? "diesel";
}

const numberField = z.union([z.number(), z.null()]);
const stringField = z.union([z.string(), z.null()]);

export const electricityFieldsSchema = z.object({
  present_meter_reading: numberField,
  previous_meter_reading: numberField,
  units_used_kwh: numberField,
  period_start: stringField, // ISO date, YYYY-MM-DD
  period_end: stringField,
  total_amount_thb: numberField,
  document_id: stringField,
});
export type ElectricityFields = z.infer<typeof electricityFieldsSchema>;

export const lpgFieldsSchema = z.object({
  quantity: numberField,
  unit: z.union([z.literal("kg"), z.literal("liter"), z.null()]),
  delivery_date: stringField,
  total_amount_thb: numberField,
  document_id: stringField,
});
export type LpgFields = z.infer<typeof lpgFieldsSchema>;

export const oilFieldsSchema = z.object({
  quantity_liters: numberField,
  delivery_date: stringField,
  total_amount_thb: numberField,
  document_id: stringField,
});
export type OilFields = z.infer<typeof oilFieldsSchema>;

export function schemaForBillType(billType: BillType) {
  if (billType === "electricity") return electricityFieldsSchema;
  if (billType === "lpg") return lpgFieldsSchema;
  return oilFieldsSchema;
}

export type ExtractedFields = ElectricityFields | LpgFields | OilFields;

// The OCR model is instructed to return the right types, but models are
// unreliable about this in practice (e.g. "12,450" instead of 12450).
// We coerce here rather than reject, and restrict the output to exactly
// the keys this bill type expects -- an AI must never introduce a field
// that ends up silently used somewhere downstream.
export function coerceExtractedFields(
  billType: BillType,
  raw: Record<string, unknown> | null
): Record<string, unknown> {
  const defs = FIELD_DEFS[billType];
  const out: Record<string, unknown> = {};
  for (const def of defs) {
    const value = raw ? raw[def.key] : undefined;
    out[def.key] = coerceOne(def.hint, value);
  }
  return out;
}

function coerceOne(hint: string, value: unknown): unknown {
  if (value === undefined || value === null || value === "") return null;
  if (hint === "number") {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const cleaned = value.replace(/,/g, "").trim();
      const n = Number(cleaned);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  }
  return typeof value === "string" ? value.trim() : value;
}

// Field descriptions shown to the OCR model and used to build the
// confirmation form. `label`/`hint` are for the UI; `key` must match
// the schema above exactly.
export const FIELD_DEFS: Record<BillType, { key: string; label: string; hint: string }[]> = {
  electricity: [
    { key: "present_meter_reading", label: "Present meter reading (เลขมิเตอร์ครั้งนี้)", hint: "number" },
    { key: "previous_meter_reading", label: "Previous meter reading (เลขมิเตอร์ครั้งก่อน)", hint: "number" },
    { key: "units_used_kwh", label: "Units used, kWh (หน่วยที่ใช้)", hint: "number" },
    { key: "period_start", label: "Billing period start (รอบบิลเริ่ม)", hint: "YYYY-MM-DD" },
    { key: "period_end", label: "Billing period end (รอบบิลสิ้นสุด)", hint: "YYYY-MM-DD" },
    { key: "total_amount_thb", label: "Total amount, THB (ยอดเงินรวม)", hint: "number" },
    { key: "document_id", label: "Bill / invoice number", hint: "text" },
  ],
  lpg: [
    { key: "quantity", label: "Quantity", hint: "number" },
    { key: "unit", label: "Unit", hint: "kg or liter" },
    { key: "delivery_date", label: "Delivery date", hint: "YYYY-MM-DD" },
    { key: "total_amount_thb", label: "Total amount, THB", hint: "number" },
    { key: "document_id", label: "Delivery / invoice number", hint: "text" },
  ],
  oil: [
    { key: "quantity_liters", label: "Quantity, liters", hint: "number" },
    { key: "delivery_date", label: "Delivery date", hint: "YYYY-MM-DD" },
    { key: "total_amount_thb", label: "Total amount, THB", hint: "number" },
    { key: "document_id", label: "Delivery / invoice number", hint: "text" },
  ],
};
