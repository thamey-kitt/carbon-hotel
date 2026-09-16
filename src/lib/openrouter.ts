import "server-only";
import { BillType, FIELD_DEFS } from "./billSchemas";

// Stage 2 of the OCR pipeline: given the plain markdown/text that Typhoon
// OCR transcribed from the bill photo, pull out exactly the fields this
// bill type needs, as JSON. This is a text-only task, well suited to a
// general instruct model -- unlike Typhoon OCR, this one actually follows
// the field list we give it.

const DEFAULT_MODEL = "google/gemma-4-31b-it:free";

export interface StructuredExtractionResult {
  raw: unknown;
  json: Record<string, unknown> | null;
  error: string | null;
}

function buildPrompt(billType: BillType, documentText: string): string {
  const fields = FIELD_DEFS[billType];
  const fieldList = fields.map((f) => `- ${f.key}: ${f.hint}`).join("\n");
  return [
    "You are given the OCR transcription of a Thai utility bill or delivery receipt.",
    `The document type is: ${billType}.`,
    "Extract exactly these fields and return ONLY a single JSON object, no markdown, no explanation:",
    fieldList,
    "",
    "Rules:",
    "- Dates must be normalised to YYYY-MM-DD.",
    "- Numbers must be plain numbers (no commas, no currency symbols, no units).",
    "- If a field is not present in the text or you are not confident, set it to null. Never guess a value.",
    "- Do not invent a field that is not listed above.",
    "",
    "--- OCR TEXT START ---",
    documentText,
    "--- OCR TEXT END ---",
  ].join("\n");
}

export async function extractStructuredFields(params: {
  documentText: string;
  billType: BillType;
}): Promise<StructuredExtractionResult> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const model = process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  if (!apiKey) {
    return { raw: null, json: null, error: "OPENROUTER_API_KEY is not set in .env.local" };
  }

  const body = {
    model,
    messages: [{ role: "user", content: buildPrompt(params.billType, params.documentText) }],
    temperature: 0,
    response_format: { type: "json_object" },
  };

  let response: Response;
  try {
    response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { raw: null, json: null, error: `Network error calling OpenRouter: ${String(err)}` };
  }

  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (raw && typeof raw === "object" && "error" in raw
        ? JSON.stringify((raw as { error: unknown }).error)
        : null) ?? `HTTP ${response.status}`;
    return { raw, json: null, error: `OpenRouter request failed: ${message}` };
  }

  const content: string | undefined = raw?.choices?.[0]?.message?.content;
  if (!content) {
    return { raw, json: null, error: "OpenRouter returned no content" };
  }

  const parsed = tryParseJson(content);
  if (!parsed) {
    return { raw, json: null, error: "Could not parse JSON from OpenRouter response" };
  }

  return { raw, json: parsed, error: null };
}

function tryParseJson(text: string): Record<string, unknown> | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  try {
    return JSON.parse(candidate.trim());
  } catch {
    return null;
  }
}
