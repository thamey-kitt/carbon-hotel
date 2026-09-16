"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { BillType, FIELD_DEFS } from "@/lib/billSchemas";
import type { CheckResult } from "@/lib/equationChecker";

interface BillRow {
  id: string;
  bill_type: BillType;
  fuel_subtype: string | null;
  status: string;
  extracted: Record<string, unknown> | null;
  checks: CheckResult[] | null;
}

export default function ConfirmPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<BillRow | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [checks, setChecks] = useState<CheckResult[]>([]);
  const [confirmedBy, setConfirmedBy] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch(`/api/bills/${params.id}`);
      const data = await res.json();
      if (cancelled) return;
      if (!res.ok) {
        setError(data.error ?? "Could not load this bill");
        setLoading(false);
        return;
      }
      setBill(data.bill);
      setImageUrl(data.imageUrl);
      const extracted: Record<string, unknown> = data.bill.extracted ?? {};
      const asStrings: Record<string, string> = {};
      for (const def of FIELD_DEFS[data.bill.bill_type as BillType]) {
        const v = extracted[def.key];
        asStrings[def.key] = v === null || v === undefined ? "" : String(v);
      }
      setFields(asStrings);
      setChecks(data.bill.checks ?? []);
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [params.id]);

  async function recheck(nextFields: Record<string, string>) {
    if (!bill) return;
    // Recompute checks client-side for instant feedback; the server
    // recomputes them again from scratch on confirm as the source of truth.
    const { runChecks } = await import("@/lib/equationChecker");
    const parsed = parseFieldsForBillType(bill.bill_type, nextFields);
    setChecks(runChecks(bill.bill_type, parsed));
  }

  function handleFieldChange(key: string, value: string) {
    const next = { ...fields, [key]: value };
    setFields(next);
    recheck(next);
  }

  async function handleConfirm() {
    if (!bill) return;
    if (!confirmedBy.trim()) {
      setError("Enter your name to confirm.");
      return;
    }
    setSubmitting(true);
    setError(null);
    const parsed = parseFieldsForBillType(bill.bill_type, fields);
    const res = await fetch(`/api/bills/${bill.id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fields: parsed, confirmed_by: confirmedBy.trim() }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error ?? "Confirm failed");
      setSubmitting(false);
      return;
    }
    setDone(true);
    setSubmitting(false);
  }

  if (loading) return <main className="flex-1 p-8 text-sm text-gray-500">Loading...</main>;
  if (error && !bill) return <main className="flex-1 p-8 text-sm text-red-600">{error}</main>;
  if (!bill) return null;

  if (done) {
    return (
      <main className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-lg font-medium">Confirmed and saved to the ledger.</p>
        <button
          onClick={() => router.push("/upload")}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Upload another bill
        </button>
      </main>
    );
  }

  const fieldDefs = FIELD_DEFS[bill.bill_type];

  return (
    <main className="flex-1 p-6">
      <h1 className="mb-6 text-2xl font-semibold">Confirm bill data</h1>
      <div className="grid gap-8 md:grid-cols-2">
        <div>
          <p className="mb-2 text-sm font-medium text-gray-600">Bill image</p>
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt="Bill" className="w-full rounded-md border" />
          ) : (
            <p className="text-sm text-gray-400">No image available</p>
          )}
        </div>

        <div className="space-y-4">
          <p className="text-sm font-medium text-gray-600">
            Extracted fields ({bill.bill_type}
            {bill.fuel_subtype ? ` / ${bill.fuel_subtype}` : ""}) &mdash; check against the image
            before confirming
          </p>

          {fieldDefs.map((def) => (
            <div key={def.key}>
              <label className="mb-1 block text-xs font-medium text-gray-500">{def.label}</label>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={fields[def.key] ?? ""}
                placeholder={def.hint}
                onChange={(e) => handleFieldChange(def.key, e.target.value)}
              />
            </div>
          ))}

          <div className="rounded-md border border-gray-200 p-3">
            <p className="mb-2 text-xs font-medium text-gray-500">Automatic checks</p>
            {checks.length === 0 && <p className="text-xs text-gray-400">No checks run yet.</p>}
            <ul className="space-y-1">
              {checks.map((c) => (
                <li
                  key={c.rule}
                  className={`text-xs ${c.passed ? "text-green-700" : "text-red-600"}`}
                >
                  {c.passed ? "✓" : "✗"} {c.message}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-gray-400">
              These checks catch obvious errors but not two mistakes that happen to cancel out
              -- always compare against the image yourself.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">Your name</label>
            <input
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={confirmedBy}
              onChange={(e) => setConfirmedBy(e.target.value)}
              placeholder="Who is confirming this?"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Confirm and save to ledger"}
          </button>
        </div>
      </div>
    </main>
  );
}

function parseFieldsForBillType(billType: BillType, fields: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const def of FIELD_DEFS[billType]) {
    const raw = fields[def.key] ?? "";
    if (def.hint === "number") {
      const n = Number(raw.replace(/,/g, ""));
      out[def.key] = raw === "" || Number.isNaN(n) ? null : n;
    } else {
      out[def.key] = raw === "" ? null : raw;
    }
  }
  return out;
}
