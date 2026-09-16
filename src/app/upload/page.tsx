"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type BillType = "electricity" | "lpg" | "oil";
type OilSubtype = "diesel" | "fuel_oil_a" | "fuel_oil_c";

const BILL_TYPE_OPTIONS: { value: BillType; label: string }[] = [
  { value: "electricity", label: "Electricity (PEA / MEA)" },
  { value: "lpg", label: "LPG" },
  { value: "oil", label: "Oil / Diesel" },
];

const OIL_SUBTYPE_OPTIONS: { value: OilSubtype; label: string }[] = [
  { value: "diesel", label: "Diesel" },
  { value: "fuel_oil_a", label: "Fuel Oil A" },
  { value: "fuel_oil_c", label: "Fuel Oil C" },
];

export default function UploadPage() {
  const router = useRouter();
  const [billType, setBillType] = useState<BillType>("electricity");
  const [oilSubtype, setOilSubtype] = useState<OilSubtype>("diesel");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleFile(f: File | null) {
    setFile(f);
    setError(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(f ? URL.createObjectURL(f) : null);
  }

  async function handleSubmit() {
    if (!file) {
      setError("Please choose a bill photo or PDF first.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("bill_type", billType);
      if (billType === "oil") formData.append("fuel_subtype", oilSubtype);

      const res = await fetch("/api/bills", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Upload failed");
        setSubmitting(false);
        return;
      }
      router.push(`/confirm/${data.id}`);
    } catch (err) {
      setError(`Upload failed: ${String(err)}`);
      setSubmitting(false);
    }
  }

  return (
    <main className="flex-1 flex flex-col items-center px-6 py-12">
      <div className="w-full max-w-lg space-y-6">
        <h1 className="text-2xl font-semibold">Upload a bill</h1>

        <div>
          <label className="mb-2 block text-sm font-medium">Bill type</label>
          <div className="flex flex-col gap-2">
            {BILL_TYPE_OPTIONS.map((opt) => (
              <label key={opt.value} className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="bill_type"
                  value={opt.value}
                  checked={billType === opt.value}
                  onChange={() => setBillType(opt.value)}
                />
                {opt.label}
              </label>
            ))}
          </div>
        </div>

        {billType === "oil" && (
          <div>
            <label className="mb-2 block text-sm font-medium">Fuel type</label>
            <select
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={oilSubtype}
              onChange={(e) => setOilSubtype(e.target.value as OilSubtype)}
            >
              {OIL_SUBTYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="mb-2 block text-sm font-medium">Bill photo or PDF</label>
          <input
            type="file"
            accept="image/*,.pdf"
            onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          {previewUrl && file?.type.startsWith("image/") && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Bill preview" className="mt-3 max-h-64 rounded-md border" />
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="w-full rounded-md bg-green-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          {submitting ? "Reading bill with AI..." : "Upload and read bill"}
        </button>
      </div>
    </main>
  );
}
