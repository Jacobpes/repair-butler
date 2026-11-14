import { connection } from "next/server";
import { readNameplate } from "@/lib/nameplate";

export const maxDuration = 30;

const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

export async function POST(request: Request) {
  await connection();

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ message: "Attach a nameplate photo." }, { status: 400 });
  }

  const file = form.get("photo");
  if (!(file instanceof File)) {
    return Response.json({ message: "Attach a nameplate photo." }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return Response.json({ message: "Use a JPEG, PNG, WebP, or GIF photo." }, { status: 400 });
  }
  if (file.size > 4 * 1024 * 1024) {
    return Response.json({ message: "Photo must be 4 MB or smaller." }, { status: 400 });
  }

  const openAiKey = process.env.OPENAI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!openAiKey && !anthropicKey) {
    return Response.json({
      available: false,
      message:
        "No vision key is set. The photo stays in your browser. Type the nameplate, or add OPENAI_API_KEY or ANTHROPIC_API_KEY.",
    });
  }

  try {
    const result = await readNameplate({
      bytes: Buffer.from(await file.arrayBuffer()),
      mediaType: file.type,
      openAiKey,
      anthropicKey,
      openAiModel: process.env.OPENAI_VISION_MODEL,
      anthropicModel: process.env.ANTHROPIC_VISION_MODEL,
      signal: AbortSignal.timeout(20_000),
    });
    if (!result.ok) {
      return Response.json({ available: true, message: result.message }, { status: 422 });
    }
    return Response.json({ available: true, reading: result.reading });
  } catch (error) {
    console.error("Nameplate read failed", error instanceof Error ? error.message : error);
    return Response.json(
      { message: "The nameplate photo could not be read. Type it instead." },
      { status: 502 },
    );
  }
}
