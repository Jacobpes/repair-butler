export type NameplateReading = {
  manufacturer: string;
  partNumber: string;
  notes: string;
};

const PROMPT =
  'Read this industrial nameplate. Return only JSON with keys manufacturer, partNumber, and notes. Use an empty string when a field is unreadable. Do not guess a part number.';

export function parseNameplateJson(text: string): NameplateReading | null {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    const parsed: unknown = JSON.parse(trimmed.slice(start, end + 1));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    const record = parsed as Record<string, unknown>;
    const manufacturer = typeof record.manufacturer === "string" ? record.manufacturer.trim() : "";
    const partNumber = typeof record.partNumber === "string" ? record.partNumber.trim() : "";
    const notes = typeof record.notes === "string" ? record.notes.trim() : "";
    if (!manufacturer && !partNumber) return null;
    return { manufacturer, partNumber, notes };
  } catch {
    return null;
  }
}

export async function readNameplate(args: {
  bytes: Buffer;
  mediaType: string;
  openAiKey?: string;
  anthropicKey?: string;
  openAiModel?: string;
  anthropicModel?: string;
  signal?: AbortSignal;
}): Promise<{ ok: true; reading: NameplateReading } | { ok: false; message: string }> {
  if (args.openAiKey) {
    return readWithOpenAi(args.bytes, args.mediaType, args.openAiKey, args.openAiModel, args.signal);
  }
  if (args.anthropicKey) {
    return readWithAnthropic(
      args.bytes,
      args.mediaType,
      args.anthropicKey,
      args.anthropicModel,
      args.signal,
    );
  }
  return {
    ok: false,
    message:
      "No vision key is set. The photo stays in your browser. Type the nameplate, or add OPENAI_API_KEY or ANTHROPIC_API_KEY.",
  };
}

async function readWithOpenAi(
  bytes: Buffer,
  mediaType: string,
  apiKey: string,
  model = "gpt-4o-mini",
  signal?: AbortSignal,
): Promise<{ ok: true; reading: NameplateReading } | { ok: false; message: string }> {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: PROMPT },
            {
              type: "image_url",
              image_url: { url: `data:${mediaType};base64,${bytes.toString("base64")}` },
            },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    return { ok: false, message: `The vision model returned ${response.status}. Type the nameplate instead.` };
  }
  const payload: unknown = await response.json();
  const content = readOpenAiContent(payload);
  const reading = content ? parseNameplateJson(content) : null;
  if (!reading) {
    return { ok: false, message: "The photo was unreadable. Type the manufacturer and part number." };
  }
  return { ok: true, reading };
}

async function readWithAnthropic(
  bytes: Buffer,
  mediaType: string,
  apiKey: string,
  model = "claude-sonnet-4-5",
  signal?: AbortSignal,
): Promise<{ ok: true; reading: NameplateReading } | { ok: false; message: string }> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    signal,
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 300,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "base64", media_type: mediaType, data: bytes.toString("base64") },
            },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    }),
  });
  if (!response.ok) {
    return { ok: false, message: `The vision model returned ${response.status}. Type the nameplate instead.` };
  }
  const payload: unknown = await response.json();
  const content = readAnthropicContent(payload);
  const reading = content ? parseNameplateJson(content) : null;
  if (!reading) {
    return { ok: false, message: "The photo was unreadable. Type the manufacturer and part number." };
  }
  return { ok: true, reading };
}

function readOpenAiContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") return null;
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  return typeof message?.content === "string" ? message.content : null;
}

function readAnthropicContent(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const content = (payload as { content?: unknown }).content;
  if (!Array.isArray(content)) return null;
  const text = content
    .map((block) =>
      block && typeof block === "object" && typeof (block as { text?: unknown }).text === "string"
        ? (block as { text: string }).text
        : "",
    )
    .join("");
  return text || null;
}
