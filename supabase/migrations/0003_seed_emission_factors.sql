-- Fix + seed: a fuel can have more than one valid emission factor in the
-- same document year, differing only by unit (e.g. LPG is published both
-- per kg and per liter). The original unique(activity_type, year_published)
-- constraint can't represent that, so widen it to include unit.
alter table emission_factors
  drop constraint if exists emission_factors_activity_type_year_published_key;

alter table emission_factors
  add constraint emission_factors_activity_type_unit_year_published_key
  unique (activity_type, unit, year_published);

-- ============================================================
-- Seed data: GHG Emission Factors for organisational carbon footprint,
-- TGO (Thailand Greenhouse Gas Management Organization), edition dated
-- February 2026 (source file: ts_578cd2cb78.pdf). Values below are the
-- "Total (kgCO2eq/unit)" column, i.e. already GWP100-weighted CO2e per
-- unit -- no separate GWP multiplication is needed downstream.
--
-- Electricity: the document publishes two grid-mix vintages. The
-- 2016-2018 vintage (0.4999 kgCO2e/kWh, doc p.11) is explicitly marked
-- "usable until 31 March 2026" -- already past as of this seeding date,
-- so only the 2022-2024 vintage is currently valid and seeded here.
--
-- Only activity types the app currently collects bills for are seeded
-- (electricity, LPG, diesel, fuel oil A/C -- see src/lib/billSchemas.ts).
-- Refrigerant leak factors (doc p.13) and other fuels in the document
-- are not yet seeded because there's no bill-upload flow that produces
-- that data (would need a manual-entry form, per the project's own
-- 9-box design for "sources with no paperwork").
-- ============================================================
insert into emission_factors (activity_type, value, unit, scope, source, source_page, year_published)
values
  ('electricity_grid', 0.4750, 'kgCO2e/kWh', 'scope2',
   'TGO Emission Factor document (GHG Emission Factors for CFO), grid mix 2022-2024', '11', 2026),

  ('lpg', 3.1133, 'kgCO2e/kg', 'scope1',
   'TGO Emission Factor document (GHG Emission Factors for CFO), Stationary Source - LPG', '1', 2026),
  ('lpg', 1.6812, 'kgCO2e/liter', 'scope1',
   'TGO Emission Factor document (GHG Emission Factors for CFO), Stationary Source - LPG', '1', 2026),

  ('diesel', 2.7076, 'kgCO2e/liter', 'scope1',
   'TGO Emission Factor document (GHG Emission Factors for CFO), Stationary Source - Diesel', '2', 2026),
  ('fuel_oil_a', 3.2198, 'kgCO2e/liter', 'scope1',
   'TGO Emission Factor document (GHG Emission Factors for CFO), Stationary Source - Fuel Oil A', '2', 2026),
  ('fuel_oil_c', 3.2455, 'kgCO2e/liter', 'scope1',
   'TGO Emission Factor document (GHG Emission Factors for CFO), Stationary Source - Fuel Oil C', '2', 2026)
on conflict (activity_type, unit, year_published) do nothing;
