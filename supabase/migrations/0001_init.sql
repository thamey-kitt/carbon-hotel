-- GreenLedger schema
-- Run this in the Supabase SQL editor (or via `supabase db push`) on a fresh project.

create extension if not exists pgcrypto;

-- ============================================================
-- bill_uploads: one row per uploaded bill photo, from upload
-- through OCR through human confirmation. Nothing here is
-- trusted data until status = 'confirmed'.
-- ============================================================
create table if not exists bill_uploads (
  id uuid primary key default gen_random_uuid(),
  bill_type text not null check (bill_type in ('electricity', 'lpg', 'oil')),
  fuel_subtype text, -- for 'oil': 'diesel' | 'fuel_oil_a' | 'fuel_oil_c'
  storage_path text not null,
  original_filename text,
  ocr_raw jsonb, -- raw model response, kept for audit
  extracted jsonb, -- structured fields as read by the AI
  checks jsonb, -- equation-checker results
  status text not null default 'pending_ocr'
    check (status in ('pending_ocr', 'ocr_failed', 'pending_confirm', 'confirmed', 'rejected')),
  ledger_ids uuid[], -- rows created in `ledger` once confirmed
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by text
);

-- ============================================================
-- ledger: the one table that holds everything (manual, p.20).
-- Never delete rows -- mark status = 'void' instead so history
-- stays traceable.
-- ============================================================
create table if not exists ledger (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null, -- e.g. 'electricity_grid', 'lpg', 'diesel'
  amount numeric not null,
  unit text not null,
  period_start date not null,
  period_end date not null,
  source text not null, -- 'bill_uploads:<id>' or 'manual:<who>'
  document_id text, -- invoice / bill number from the source document
  status text not null default 'active' check (status in ('active', 'void')),
  created_at timestamptz not null default now(),
  created_by text,
  check (period_end >= period_start)
);

-- ============================================================
-- emission_factors: only TGO / IPCC / HCMI sourced values.
-- Seeded separately from the official TGO document, never
-- written to by the AI.
-- ============================================================
create table if not exists emission_factors (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null,
  value numeric not null,
  unit text not null, -- e.g. 'kgCO2e/kWh', 'kgCO2e/kg', 'kgCO2e/liter'
  scope text not null check (scope in ('scope1', 'scope2', 'fugitive')),
  source text not null, -- e.g. 'TGO Emission Factor document'
  source_page text,
  year_published int not null,
  created_at timestamptz not null default now(),
  unique (activity_type, year_published)
);

-- ============================================================
-- Row Level Security: enabled with NO policies for anon/authenticated.
-- The Next.js app talks to Supabase only from server-side API routes
-- using the service_role key (which bypasses RLS). The browser never
-- holds the service_role key and never queries these tables directly.
-- ============================================================
alter table bill_uploads enable row level security;
alter table ledger enable row level security;
alter table emission_factors enable row level security;

-- ============================================================
-- Storage: private bucket for bill photos/PDFs. Not public --
-- the app reads files through short-lived signed URLs created
-- server-side (service_role), never a public bucket URL.
-- ============================================================
insert into storage.buckets (id, name, public)
values ('bills', 'bills', false)
on conflict (id) do nothing;
