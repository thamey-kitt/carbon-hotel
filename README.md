# GreenLedger

Upload a hotel utility bill (electricity / LPG / oil), read it with AI OCR, review
and correct the extracted numbers, then save the confirmed values into a carbon
ledger. This is milestone 1 of the project: **upload → OCR → human confirm**.
Calculation (CFO/HCMI reports) and the chatbot are not built yet.

## One-time setup

### 1. Supabase

The project is already linked to a Supabase project (`carbon hotel`,
ref `abiwchfezxsbercmccsv`) via the Supabase CLI. `supabase/migrations/` holds
the schema: `bill_uploads`, `ledger`, `emission_factors` (RLS enabled), plus a
private `bills` storage bucket. To (re-)apply migrations after a change:

```bash
npx supabase db push --linked
```

`.env.local` already has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
and `SUPABASE_SERVICE_ROLE_KEY` filled in for this project.

### 2. API keys

```
TYPHOON_API_KEY=...       # from opentyphoon.ai -- already set
OPENROUTER_API_KEY=...    # from openrouter.ai -- needed, see below
OPENROUTER_MODEL=google/gemma-4-31b-it:free
```

OCR is a two-stage pipeline (see below) and the second stage needs an
OpenRouter key (a free-tier model is fine). Get one at
[openrouter.ai/keys](https://openrouter.ai/keys) and add it to `.env.local`.

Popular free models (e.g. `google/gemma-4-31b-it:free`) get rate-limited
upstream often -- if extraction starts failing with HTTP 429, switch
`OPENROUTER_MODEL` to a less crowded free model
([full list](https://openrouter.ai/models?max_price=0)) and restart `npm run dev`.

### 3. Run it

```bash
npm run dev
```

Open [http://localhost:3000/upload](http://localhost:3000/upload).

## How the OCR pipeline works

Typhoon OCR (`typhoon-ocr-preview`) turned out to be a fine-tuned
image-to-markdown transcriber, not a general instruction-follower — it always
replies with `{"natural_text": "<markdown>"}` no matter what you ask it to
extract. So OCR is two stages:

1. **Typhoon OCR** (`src/lib/typhoon.ts`) reads the bill photo and returns a
   faithful markdown/text transcription of everything on it.
2. **OpenRouter** (`src/lib/openrouter.ts`) reads that transcription (text
   only, no image) and pulls out exactly the fields the selected bill type
   needs (see `src/lib/billSchemas.ts`), told to return `null` rather than
   guess a field it isn't confident about.

Only image uploads are OCR'd right now — PDF bills are stored, but skipped
for OCR (no page-rasterisation step yet), so they need fields filled in by
hand on the confirm screen.

## How the full flow works

1. **`/upload`** — pick a bill type (Electricity / LPG / Oil) and a photo or PDF.
   The file is uploaded to the private `bills` storage bucket and a row is
   created in `bill_uploads`.
2. The two-stage OCR above runs and fills in `bill_uploads.extracted`.
3. An **equation checker** (`src/lib/equationChecker.ts`) runs sanity checks —
   e.g. for electricity, present meter reading must exceed the previous one,
   and the printed units used must equal the subtraction. These checks catch
   obvious misreads but not two mistakes that happen to cancel out — a human
   still has to look at the image.
4. **`/confirm/[id]`** shows the bill image next to the editable extracted
   fields and the check results. Nothing is written to the ledger until a
   human enters their name and presses confirm.
5. On confirm, one row is written to `ledger` (never deleted — only ever
   marked `void` later) and `bill_uploads.status` becomes `confirmed`.

## Emission factors

`emission_factors` is seeded (`supabase/migrations/0003_seed_emission_factors.sql`)
from the official TGO document (`ts_578cd2cb78.pdf`, Feb 2026 edition) for the
5 activity types the app currently collects bills for: `electricity_grid`,
`lpg` (per kg and per liter), `diesel`, `fuel_oil_a`, `fuel_oil_c`. Every row
records its source, page, and the document's publication year, per the
project's rule that a number without a traceable source/year is unusable.
Electricity uses the 2022-2024 grid-mix value (0.4750 kgCO2e/kWh) because the
document marks the older 2016-2018 vintage as expired after 31 March 2026.
Refrigerant leak factors (doc p.13) aren't seeded yet — no bill-upload flow
collects that data yet (would need a manual-entry form).

## Not built yet

- The carbon calculator and CFO / HCMI report pages (ledger + emission
  factors are both ready for this now).
- PDF OCR (page rasterisation to image before the Typhoon call).
- The chatbot (OpenRouter, same free-model account as the OCR extraction step).
- Auth / login — right now anyone with the URL can use `/upload`, which is
  fine for local development but must be added before this goes further
  than your own machine.
