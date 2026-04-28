export function parseOpenAiCompatibleSseLine(line: string): string | null {
  const payload = parseSseData(line);
  if (!payload || payload === "[DONE]") {
    return null;
  }

  const parsed = safeJson(payload);
  const content = parsed?.choices?.[0]?.delta?.content;
  return typeof content === "string" ? content : null;
}

export function parseAnthropicSseLine(line: string): string | null {
  const payload = parseSseData(line);
  if (!payload) {
    return null;
  }

  const parsed = safeJson(payload);
  const text = parsed?.delta?.text;
  return parsed?.type === "content_block_delta" && typeof text === "string" ? text : null;
}

export function parseOllamaJsonLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) {
    return null;
  }

  const parsed = safeJson(trimmed);
  const content = parsed?.message?.content ?? parsed?.response;
  return typeof content === "string" ? content : null;
}

function parseSseData(line: string) {
  const trimmed = line.trim();
  return trimmed.startsWith("data:") ? trimmed.slice(5).trim() : null;
}

function safeJson(input: string): any {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}
