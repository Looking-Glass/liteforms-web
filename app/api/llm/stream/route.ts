import { type NextRequest } from "next/server";
import { createLlmAdapter } from "@/lib/llm/adapters";
import { streamOpenAiCodexResponsesText } from "@/lib/llm/openAiCodexResponses";
import type { ChatRequest } from "@/lib/llm/types";

export async function POST(request: NextRequest) {
  const body: ChatRequest = await request.json();
  const source =
    body.config.provider === "openai-codex"
      ? streamOpenAiCodexResponsesText(body, globalThis.fetch)
      : createLlmAdapter({ config: body.config, fetch: globalThis.fetch }).streamText(body);

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of source) {
          controller.enqueue(new TextEncoder().encode(chunk));
        }
        controller.close();
      } catch (error) {
        controller.enqueue(new TextEncoder().encode(error instanceof Error ? error.message : "LLM request failed"));
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8" }
  });
}
