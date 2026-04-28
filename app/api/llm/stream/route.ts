import { type NextRequest } from "next/server";
import { createLlmAdapter } from "@/lib/llm/adapters";
import type { ChatRequest } from "@/lib/llm/types";

export async function POST(request: NextRequest) {
  const body: ChatRequest = await request.json();

  // Pass global fetch explicitly so the adapter runs in server mode (no CORS proxy loop)
  const adapter = createLlmAdapter({ config: body.config, fetch: globalThis.fetch });

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of adapter.streamText(body)) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
