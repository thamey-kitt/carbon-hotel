-- The OCR pipeline is two stages: Typhoon transcribes the bill photo to
-- markdown, then a second model extracts structured fields from that text.
-- Keep the intermediate markdown around for debugging/audit.
alter table bill_uploads add column if not exists ocr_markdown text;
