import { connection } from "next/server";
import { parseIntake } from "@/lib/intake";
import { runResearch } from "@/lib/research";

export const maxDuration = 60;

const MISSING_KEY =
  "This server has no EXA_API_KEY, so Repair Butler cannot search the live web yet. Add the key to .env.local and restart.";

export async function POST(request: Request) {
  await connection();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "The request body must be JSON." }, { status: 400 });
  }

  const parsed = parseIntake(body);
  if (!parsed.ok) {
    return Response.json({ message: parsed.message }, { status: 400 });
  }

  const apiKey = process.env.EXA_API_KEY?.trim();
  if (!apiKey) {
    return Response.json({ message: MISSING_KEY }, { status: 503 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        if (request.signal.aborted) return;
        try {
          controller.enqueue(
            encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
          );
        } catch {
          // The browser closed the stream.
        }
      };
      try {
        await runResearch({
          intake: parsed.intake,
          apiKey,
          signal: request.signal,
          send,
        });
      } catch (error) {
        console.error("Research failed", error instanceof Error ? error.message : error);
        send("error", { message: "The search stopped before it finished." });
      } finally {
        try {
          controller.close();
        } catch {
          // Already closed.
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
