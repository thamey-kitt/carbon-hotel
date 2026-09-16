import "server-only";
import { imageSize } from "image-size";

// Typhoon OCR (typhoon-ocr-preview, hosted at api.opentyphoon.ai) is a
// fine-tuned OCR model: it only understands two fixed prompt templates
// ("default" / "structure") and always answers with a JSON object of the
// form {"natural_text": "<markdown>"} -- it ignores any other instruction,
// such as "extract these specific fields". This is by design (it's an
// image-to-markdown transcriber, not a general instruction-follower), so
// we use it only for that: turn the bill photo into faithful markdown
// text. A second, separate model then reads that markdown to pull out
// structured fields (see openrouter.ts).

function buildStructurePrompt(width: number, height: number): string {
  const anchorText = `Page dimensions: ${width.toFixed(1)}x${height.toFixed(1)}\n[Image 0x0 to ${width.toFixed(0)}x${height.toFixed(0)}]\n`;
  return [
    "Below is an image of a document page, along with its dimensions and possibly some raw textual content previously extracted from it. ",
    "Note that the text extraction may be incomplete or partially missing. Carefully consider both the layout and any available text to reconstruct the document accurately.",
    "Your task is to return the markdown representation of this document, presenting tables in HTML format as they naturally appear.",
    "If the document contains images or figures, analyze them and include the tag <figure>IMAGE_ANALYSIS</figure> in the appropriate location.",
    "Your final output must be in JSON format with a single key `natural_text` containing the response.",
    `RAW_TEXT_START\n${anchorText}\nRAW_TEXT_END`,
  ].join("\n");
}

export interface TyphoonOcrResult {
  markdown: string | null;
  raw: unknown;
  error: string | null;
}

export async function runTyphoonOcr(params: {
  base64Image: string;
  mimeType: string;
}): Promise<TyphoonOcrResult> {
  const apiKey = process.env.TYPHOON_API_KEY;
  const baseUrl = process.env.TYPHOON_BASE_URL ?? "https://api.opentyphoon.ai/v1";
  const model = process.env.TYPHOON_MODEL ?? "typhoon-ocr-preview";

  if (!apiKey) {
    return { markdown: null, raw: null, error: "TYPHOON_API_KEY is not set in .env.local" };
  }
  if (!params.mimeType.startsWith("image/")) {
    return {
      markdown: null,
      raw: null,
      error: "Typhoon OCR only accepts image files here (PDF page rasterisation is not implemented yet). Please upload a photo instead, or fill the fields in manually.",
    };
  }

  let width = 1000;
  let height = 1400;
  try {
    const dims = imageSize(Buffer.from(params.base64Image, "base64"));
    if (dims.width && dims.height) {
      width = dims.width;
      height = dims.height;
    }
  } catch {
    // Fall back to the placeholder dimensions above; this is only used
    // for a descriptive hint the model doesn't strictly depend on.
  }

  const body = {
    model,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: buildStructurePrompt(width, height) },
          {
            type: "image_url",
            image_url: { url: `data:${params.mimeType};base64,${params.base64Image}` },
          },
        ],
      },
    ],
    max_tokens: 16384,
    temperature: 0.1,
    top_p: 0.6,
    repetition_penalty: 1.2,
  };

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { markdown: null, raw: null, error: `Network error calling Typhoon OCR: ${String(err)}` };
  }

  const raw = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      (raw && typeof raw === "object" && "error" in raw
        ? JSON.stringify((raw as { error: unknown }).error)
        : null) ?? `HTTP ${response.status}`;
    return { markdown: null, raw, error: `Typhoon OCR request failed: ${message}` };
  }

  const content: string | undefined = raw?.choices?.[0]?.message?.content;
  if (!content) {
    return { markdown: null, raw, error: "Typhoon OCR returned no content" };
  }

  const parsed = tryParseJson(content);
  const naturalText = parsed && typeof parsed.natural_text === "string" ? parsed.natural_text : null;
  if (!naturalText) {
    // The model sometimes returns plain text instead of the JSON wrapper
    // despite instructions -- fall back to using it directly rather than
    // discarding a perfectly good transcription.
    return { markdown: content, raw, error: null };
  }

  return { markdown: naturalText, raw, error: null };
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
