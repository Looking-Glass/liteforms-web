import { normalizeTtsConfig } from "./config";
import { KokoroWorkerClient } from "./workerClient";
import type { FetchLike } from "@/lib/llm";
import type { TtsAdapter, TtsConfig, TtsResult, TtsWorkerLike } from "./types";

type CreateTtsAdapterInput = {
  config: TtsConfig;
  fetch?: FetchLike;
  worker?: TtsWorkerLike;
};

export function createTtsAdapter(input: CreateTtsAdapterInput): TtsAdapter {
  const config = normalizeTtsConfig(input.config);
  const fetchImpl = input.fetch ?? fetch;

  if (config.provider === "kokoro") {
    const worker = input.worker ?? new KokoroWorkerClient();
    return {
      provider: "kokoro",
      synthesize(text) {
        return worker.synthesize({ ...config, text });
      }
    };
  }

  if (config.provider === "elevenlabs") {
    return {
      provider: "elevenlabs",
      synthesize(text) {
        return synthesizeElevenLabs(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "deepgram") {
    return {
      provider: "deepgram",
      synthesize(text) {
        return synthesizeDeepgram(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "openai") {
    return {
      provider: "openai",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "google") {
    return {
      provider: "google",
      synthesize(text) {
        return synthesizeGoogle(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "xai") {
    return {
      provider: "xai",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "deepinfra") {
    return {
      provider: "deepinfra",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "openrouter") {
    return {
      provider: "openrouter",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "inworld") {
    return {
      provider: "inworld",
      synthesize(text) {
        return synthesizeInworld(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "minimax") {
    return {
      provider: "minimax",
      synthesize(text) {
        return synthesizeMiniMax(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "gradium") {
    return {
      provider: "gradium",
      synthesize(text) {
        return synthesizeElevenLabsCompat(text, config, "xi-api-key", fetchImpl);
      }
    };
  }

  if (config.provider === "vydra") {
    return {
      provider: "vydra",
      synthesize(text) {
        return synthesizeElevenLabsCompat(text, config, "xi-api-key", fetchImpl);
      }
    };
  }

  if (config.provider === "xiaomi") {
    return {
      provider: "xiaomi",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "azure-speech") {
    return {
      provider: "azure-speech",
      synthesize(text) {
        return synthesizeAzureSpeech(text, config, fetchImpl);
      }
    };
  }

  if (config.provider === "microsoft") {
    return {
      provider: "microsoft",
      synthesize(text) {
        return synthesizeOpenAiCompatible(text, config, fetchImpl);
      }
    };
  }

  // volcengine
  return {
    provider: "volcengine",
    synthesize(text) {
      return synthesizeVolcengine(text, config, fetchImpl);
    }
  };
}

// ── IncrementalSpeechBuffer ────────────────────────────────────────────────────

const SOFT_BOUNDARY_MIN_CHARS = 256;

const ABBREVIATIONS = new Set([
  "Dr", "Mr", "Mrs", "Ms", "Prof", "Rev", "St", "Gen", "Col", "Maj", "Capt",
  "Lt", "Sgt", "Cpl", "Pvt", "Cmdr", "Gov", "Sen", "Rep", "Dept", "Jr", "Sr"
]);

/**
 * Incrementally ingests LLM streaming tokens and extracts complete sentences
 * as soon as they form. Mirrors the openclaw IncrementalSpeechBuffer approach.
 *
 * Boundary rules (in priority order):
 *  - Hard boundaries: `.` `?` `!` `\n` (with guards for abbreviations and decimals)
 *  - Soft boundary: any whitespace after ≥72 visible characters (prevents
 *    indefinite waiting when sentences lack terminal punctuation)
 *  - Code fences: content inside ``` ... ``` is silently skipped — never spoken
 */
export class IncrementalSpeechBuffer {
  private accumulated = "";
  private spokenOffset = 0;
  private inCodeBlock = false;

  /** Feed a new text chunk. Returns any complete segments ready for synthesis. */
  ingest(text: string, isFinal: boolean): string[] {
    this.accumulated += text;
    return this.extractSegments(isFinal);
  }

  /** Discard all buffered state (e.g. after a think-block reset). */
  reset() {
    this.accumulated = "";
    this.spokenOffset = 0;
    this.inCodeBlock = false;
  }

  private extractSegments(isFinal: boolean): string[] {
    const segments: string[] = [];
    const text = this.accumulated;
    let idx = this.spokenOffset;
    let inCodeBlock = this.inCodeBlock;
    // visibleBuffer accumulates only the speakable (non-code-block) text
    // for the current in-progress segment.
    let visibleBuffer = "";
    let charsSinceBoundary = 0;
    // Position in `text` after the last completed segment (drives spokenOffset).
    let lastBoundaryTextIdx = this.spokenOffset;

    while (idx < text.length) {
      // Code fence toggle: ```
      if (
        text[idx] === "`" &&
        idx + 2 < text.length &&
        text[idx + 1] === "`" &&
        text[idx + 2] === "`"
      ) {
        inCodeBlock = !inCodeBlock;
        idx += 3;
        continue;
      }

      if (!inCodeBlock) {
        const ch = text[idx];
        charsSinceBoundary++;
        visibleBuffer += ch;

        if (
          this.isHardBoundary(ch, text, idx) ||
          this.isSoftBoundary(ch, charsSinceBoundary)
        ) {
          const segment = visibleBuffer.trim();
          if (segment) segments.push(segment);
          visibleBuffer = "";
          charsSinceBoundary = 0;
          lastBoundaryTextIdx = idx + 1;
        }
      }

      idx++;
    }

    if (isFinal) {
      const remainder = visibleBuffer.trim();
      if (remainder) segments.push(remainder);
      this.spokenOffset = text.length;
    } else {
      this.spokenOffset = lastBoundaryTextIdx;
    }

    this.inCodeBlock = inCodeBlock;
    return segments;
  }

  private isHardBoundary(ch: string, text: string, idx: number): boolean {
    if (ch === "?" || ch === "!" || ch === "\n") return true;
    if (ch !== ".") return false;

    // Decimal guard: digit.digit → not a sentence boundary
    if (
      idx > 0 &&
      idx + 1 < text.length &&
      /\d/.test(text[idx - 1]) &&
      /\d/.test(text[idx + 1])
    ) {
      return false;
    }

    // Abbreviation guard: look back up to 10 chars for a known abbreviation
    const preceding = text.slice(Math.max(0, idx - 10), idx);
    const wordMatch = preceding.match(/([A-Za-z]+)$/);
    if (wordMatch && ABBREVIATIONS.has(wordMatch[1])) return false;

    return true;
  }

  private isSoftBoundary(ch: string, charsSinceBoundary: number): boolean {
    return charsSinceBoundary >= SOFT_BOUNDARY_MIN_CHARS && /\s/.test(ch);
  }
}

// ── Decimal rewriting ──────────────────────────────────────────────────────────

/**
 * Rewrites decimal numbers so TTS pronounces them naturally.
 * e.g.  "18.5"  →  "18 point 5"
 */
export function rewriteDecimalsForTts(text: string): string {
  return text.replace(/(\d+)\.(\d+)/g, "$1 point $2");
}

/**
 * Returns the portion of the raw LLM output that is safe to feed to TTS.
 * - Strips completed <think>...</think> blocks.
 * - Truncates at any `<` that has no matching `>` after it, preventing
 *   partial think-block tags from polluting the TTS buffer.
 */
export function getSafeTextForTts(raw: string): string {
  // Strip complete think blocks, trailing whitespace runs, etc.
  let sanitized = raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/gi, "")
    .replace(/<\/think>/gi, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Truncate at any potentially incomplete XML/HTML tag to avoid
  // emitting partial <think> tokens like "<thi" to the TTS buffer.
  const ltIdx = sanitized.lastIndexOf("<");
  if (ltIdx >= 0 && sanitized.indexOf(">", ltIdx) < 0) {
    sanitized = sanitized.slice(0, ltIdx).trimEnd();
  }

  return sanitized;
}

// ── Legacy helpers (kept for backward compatibility) ──────────────────────────

export function splitSpeakableText(text: string) {
  const chunks: string[] = [];
  let remainder = text;
  const sentencePattern = /[^.!?]+[.!?]+(?:\s+|$)/g;
  const matches = text.match(sentencePattern) ?? [];
  for (const match of matches) {
    const chunk = match.trim();
    if (chunk) {
      chunks.push(chunk);
    }
  }
  if (chunks.length > 0) {
    const consumed = matches.join("").length;
    remainder = text.slice(consumed).trimStart();
  }
  return { chunks, remainder };
}

export async function speakTextChunks(chunks: string[], adapter: TtsAdapter, play: (result: TtsResult) => Promise<void>) {
  for (const chunk of chunks) {
    const result = await adapter.synthesize(chunk);
    await play(result);
  }
}

// ── ElevenLabs ────────────────────────────────────────────────────────────────

async function synthesizeElevenLabs(
  text: string,
  config: Extract<ReturnType<typeof normalizeTtsConfig>, { provider: "elevenlabs" }>,
  fetchImpl: FetchLike
) {
  const response = await fetchImpl(
    `${trimSlash(config.baseUrl)}/text-to-speech/${encodeURIComponent(config.voiceId)}/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
        "xi-api-key": config.credential
      },
      body: JSON.stringify({
        text,
        model_id: config.modelId,
        voice_settings: {
          stability: config.stability,
          similarity_boost: config.similarityBoost,
          style: config.style,
          use_speaker_boost: config.useSpeakerBoost,
          speed: config.speed
        },
        ...(config.seed != null && { seed: config.seed }),
        ...(config.languageCode?.trim() && { language_code: config.languageCode }),
        ...(config.applyTextNormalization && { apply_text_normalization: config.applyTextNormalization })
      })
    }
  );
  return audioResponse(response);
}

// ── Deepgram ──────────────────────────────────────────────────────────────────

async function synthesizeDeepgram(
  text: string,
  config: Extract<ReturnType<typeof normalizeTtsConfig>, { provider: "deepgram" }>,
  fetchImpl: FetchLike
) {
  const response = await fetchImpl(
    `${trimSlash(config.baseUrl)}/speak?model=${encodeURIComponent(config.model)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "audio/wav",
        Authorization: `Token ${config.credential}`
      },
      body: JSON.stringify({ text })
    }
  );
  return audioResponse(response);
}

// ── OpenAI-compatible (openai, xai, deepinfra, openrouter, xiaomi, microsoft) ─

async function synthesizeOpenAiCompatible(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string; speed?: number; instructions?: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({
      model: config.model,
      input: text,
      voice: config.voice,
      ...(config.speed != null && { speed: config.speed }),
      ...(config.instructions?.trim() && { instructions: config.instructions })
    })
  });
  return audioResponse(response);
}

// ── Google Gemini TTS ──────────────────────────────────────────────────────────

type GoogleInlineDataPart = { mimeType?: string; mime_type?: string; data?: string };

/** Walks the generateContent response, accepting both camelCase and snake_case
 *  inline-data keys so the code is resilient to Gemini API formatting variations. */
export function extractGoogleInlineData(
  payload: unknown
): { mimeType: string | undefined; data: string } | undefined {
  const candidates = (payload as { candidates?: unknown[] })?.candidates;
  if (!Array.isArray(candidates)) return undefined;
  for (const candidate of candidates) {
    const parts = (candidate as { content?: { parts?: unknown[] } })?.content?.parts;
    if (!Array.isArray(parts)) continue;
    for (const part of parts) {
      const p = part as { inlineData?: GoogleInlineDataPart; inline_data?: GoogleInlineDataPart };
      const inline = p.inlineData ?? p.inline_data;
      const data = typeof inline?.data === "string" && inline.data ? inline.data : undefined;
      if (!data) continue;
      const mimeType = inline?.mimeType ?? inline?.mime_type;
      return { mimeType, data };
    }
  }
  return undefined;
}

async function synthesizeGoogle(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const url = `${trimSlash(config.baseUrl)}/v1beta/models/${encodeURIComponent(config.model)}:generateContent?key=${encodeURIComponent(config.credential)}`;
  const requestBody = {
    contents: [{ parts: [{ text }] }],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voice } } }
    }
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await synthesizeGoogleOnce(url, requestBody, fetchImpl);
    } catch (error) {
      lastError = error;
      if (!isGoogleTtsRetryableError(error) || attempt > 0) {
        throw error;
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

class GoogleTtsRetryableError extends Error {}

function isGoogleTtsRetryableError(error: unknown): error is GoogleTtsRetryableError {
  return error instanceof GoogleTtsRetryableError;
}

async function synthesizeGoogleOnce(
  url: string,
  requestBody: {
    contents: { parts: { text: string }[] }[];
    generationConfig: {
      responseModalities: string[];
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } };
    };
  },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody)
    });
  } catch (error) {
    throw new GoogleTtsRetryableError(error instanceof Error ? error.message : String(error));
  }
  if (!response.ok) {
    const error = new Error(`Google TTS failed with ${response.status}`);
    if (response.status >= 500) {
      throw new GoogleTtsRetryableError(error.message);
    }
    throw error;
  }
  const data = await response.json();
  const part = extractGoogleInlineData(data);
  if (!part) throw new GoogleTtsRetryableError("Google TTS: no audio in response");
  const audio = Uint8Array.from(atob(part.data), (c) => c.charCodeAt(0)).buffer;
  const rawMime = (part.mimeType ?? "").toLowerCase();
  const isL16 = rawMime.startsWith("audio/l16") || rawMime.startsWith("audio/pcm");
  const rateMatch = rawMime.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1], 10) : 24000;
  return {
    audio,
    mimeType: isL16 ? "audio/pcm" : (part.mimeType ?? "audio/wav"),
    sampleRate: isL16 ? sampleRate : undefined
  };
}

// ── Inworld ───────────────────────────────────────────────────────────────────

async function synthesizeInworld(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/tts/v1/voice:stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${config.credential}`
    },
    body: JSON.stringify({
      text,
      voiceId: config.voice,
      modelId: config.model,
      audioConfig: { audioEncoding: "MP3" }
    })
  });
  if (!response.ok) throw new Error(`Inworld TTS failed with ${response.status}`);
  const body = await response.text();
  const chunks: Uint8Array[] = [];
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: { result?: { audioContent?: string }; error?: { code?: number; message?: string } };
    try {
      parsed = JSON.parse(trimmed) as typeof parsed;
    } catch {
      throw new Error(`Inworld TTS stream parse error: unexpected non-JSON line: ${trimmed.slice(0, 80)}`);
    }
    if (parsed.error) {
      throw new Error(`Inworld TTS stream error (${parsed.error.code}): ${parsed.error.message}`);
    }
    if (parsed.result?.audioContent) {
      chunks.push(Uint8Array.from(atob(parsed.result.audioContent), (c) => c.charCodeAt(0)));
    }
  }
  if (chunks.length === 0) throw new Error("Inworld TTS: no audio in response");
  const totalLength = chunks.reduce((sum, chunk) => sum + chunk.byteLength, 0);
  const audio = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    audio.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { audio: audio.buffer, mimeType: "audio/mpeg" };
}

// ── MiniMax ───────────────────────────────────────────────────────────────────

async function synthesizeMiniMax(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string; speed: number; vol: number; pitch: number },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/v1/t2a_v2`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({
      model: config.model,
      text,
      voice_setting: { voice_id: config.voice, speed: config.speed, vol: config.vol, pitch: config.pitch },
      audio_setting: { sample_rate: 32000, format: "mp3" }
    })
  });
  if (!response.ok) throw new Error(`MiniMax TTS failed with ${response.status}`);
  const data = await response.json();
  const hexAudio = data?.data?.audio as string | undefined;
  if (!hexAudio) throw new Error("MiniMax TTS: no audio in response");
  const bytes = new Uint8Array(hexAudio.match(/.{1,2}/g)!.map((b: string) => parseInt(b, 16)));
  return { audio: bytes.buffer, mimeType: "audio/mpeg" };
}

// ── ElevenLabs-compatible (gradium, vydra) ────────────────────────────────────

async function synthesizeElevenLabsCompat(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  authHeader: "xi-api-key" | "bearer",
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Accept: "audio/mpeg"
  };
  if (authHeader === "xi-api-key") {
    headers["xi-api-key"] = config.credential;
  } else {
    headers["Authorization"] = `Bearer ${config.credential}`;
  }
  const response = await fetchImpl(
    `${trimSlash(config.baseUrl)}/text-to-speech/${encodeURIComponent(config.voice)}/stream`,
    { method: "POST", headers, body: JSON.stringify({ text, model_id: config.model }) }
  );
  return audioResponse(response);
}

// ── Azure Speech ──────────────────────────────────────────────────────────────

async function synthesizeAzureSpeech(
  text: string,
  config: { credential: string; baseUrl: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const escaped = text.replace(/[<>&"']/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&apos;" })[c] ?? c
  );
  const ssml = `<speak version="1.0" xml:lang="en-US"><voice name="${config.voice}">${escaped}</voice></speak>`;
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/cognitiveservices/v1`, {
    method: "POST",
    headers: {
      "Content-Type": "application/ssml+xml",
      "Ocp-Apim-Subscription-Key": config.credential,
      "X-Microsoft-OutputFormat": "audio-16khz-32kbitrate-mono-mp3"
    },
    body: ssml
  });
  return audioResponse(response);
}

// ── Volcengine ────────────────────────────────────────────────────────────────

async function synthesizeVolcengine(
  text: string,
  config: { credential: string; baseUrl: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/api/v3/tts/unidirectional`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({
      app: { cluster: "volcano_tts" },
      user: { uid: "liteforms" },
      audio: { voice_type: config.voice, encoding: "mp3" },
      request: { text, reqid: Date.now().toString(), operation: "query" }
    })
  });
  if (!response.ok) throw new Error(`Volcengine TTS failed with ${response.status}`);
  const data = await response.json();
  const b64 = data?.data?.audio as string | undefined;
  if (!b64) throw new Error("Volcengine TTS: no audio in response");
  const audio = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  return { audio, mimeType: "audio/mpeg" };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function audioResponse(response: Response): Promise<TtsResult> {
  if (!response.ok) {
    throw new Error(`TTS provider request failed with ${response.status}`);
  }
  return {
    audio: await response.arrayBuffer(),
    mimeType: response.headers.get("content-type") ?? "application/octet-stream"
  };
}

function trimSlash(input: string) {
  return input.replace(/\/+$/, "");
}
