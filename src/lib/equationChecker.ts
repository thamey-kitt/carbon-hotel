import { BillType } from "./billSchemas";

export interface CheckResult {
  rule: string;
  passed: boolean;
  message: string;
}

// A note we always attach: two matching misreads (e.g. both meter
// readings shifted by the same amount) will still pass these checks.
// This reduces risk, it does not eliminate it -- a human must still
// look at the bill image before confirming.

export function runChecks(billType: BillType, fields: Record<string, unknown>): CheckResult[] {
  const results: CheckResult[] = [];
  const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const dateOf = (v: unknown): Date | null => {
    if (typeof v !== "string" || !v) return null;
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  if (billType === "electricity") {
    const present = num(fields.present_meter_reading);
    const previous = num(fields.previous_meter_reading);
    const units = num(fields.units_used_kwh);

    results.push({
      rule: "meter_must_increase",
      passed: present !== null && previous !== null ? present > previous : false,
      message: "Present meter reading must be greater than the previous reading.",
    });

    results.push({
      rule: "subtraction_matches_units",
      passed:
        present !== null && previous !== null && units !== null
          ? Math.abs(present - previous - units) < 0.5
          : false,
      message: "present - previous must equal the printed units used.",
    });
  }

  if (billType === "lpg" || billType === "oil") {
    const quantity = num(billType === "lpg" ? fields.quantity : fields.quantity_liters);
    results.push({
      rule: "quantity_positive",
      passed: quantity !== null && quantity > 0,
      message: "Quantity must be a positive number.",
    });
  }

  const start = dateOf(fields.period_start ?? fields.delivery_date);
  const end = dateOf(fields.period_end ?? fields.delivery_date);
  if (start && end) {
    results.push({
      rule: "end_after_start",
      passed: end.getTime() >= start.getTime(),
      message: "Period end date must not be before the start date.",
    });
  }

  return results;
}

export function allChecksPassed(results: CheckResult[]): boolean {
  return results.length > 0 && results.every((r) => r.passed);
}
