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
        }
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
  config: { credential: string; baseUrl: string; model: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/audio/speech`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({ model: config.model, input: text, voice: config.voice })
  });
  return audioResponse(response);
}

// ── Google Gemini TTS ──────────────────────────────────────────────────────────

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
  // #region agent log
  console.log('[dbg-f2778a] google-tts-request', {model:config.model, voice:config.voice, urlWithoutKey:url.replace(/key=[^&]+/,'key=REDACTED'), body:requestBody});
  // #endregion
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  });
  // #region agent log
  console.log('[dbg-f2778a] google-tts-response-status', {status:response.status, ok:response.ok, statusText:response.statusText});
  // #endregion
  if (!response.ok) {
    const errText = await response.text().catch(() => "(unreadable)");
    // #region agent log
    console.log('[dbg-f2778a] google-tts-http-error', {status:response.status, body:errText.slice(0,800)});
    // #endregion
    throw new Error(`Google TTS failed with ${response.status}`);
  }
  const data = await response.json();
  // #region agent log
  console.log('[dbg-f2778a] google-tts-response-body', {hasError:!!data?.error, errorCode:data?.error?.code, errorMsg:data?.error?.message, candidatesLength:data?.candidates?.length, finishReason:data?.candidates?.[0]?.finishReason, contentPartsLength:data?.candidates?.[0]?.content?.parts?.length, part0Keys:data?.candidates?.[0]?.content?.parts?.[0] ? Object.keys(data.candidates[0].content.parts[0]) : null, mimeType:data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.mimeType, hasInlineData:!!data?.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data, rawData:JSON.stringify(data).slice(0,600)});
  console.log('[dbg-f2778a] google-tts-raw-json', JSON.stringify(data).slice(0, 800));
  // #endregion
  const part = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData as
    | { mimeType: string; data: string }
    | undefined;
  if (!part) throw new Error("Google TTS: no audio in response");
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
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/studio/v1/tts:synthesize`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({
      text,
      config: { modelId: config.model },
      voice: { name: config.voice }
    })
  });
  if (!response.ok) throw new Error(`Inworld TTS failed with ${response.status}`);
  const data = await response.json();
  const b64 = (data?.audio ?? data?.data) as string | undefined;
  if (!b64) throw new Error("Inworld TTS: no audio in response");
  const audio = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer;
  return { audio, mimeType: "audio/wav" };
}

// ── MiniMax ───────────────────────────────────────────────────────────────────

async function synthesizeMiniMax(
  text: string,
  config: { credential: string; baseUrl: string; model: string; voice: string },
  fetchImpl: FetchLike
): Promise<TtsResult> {
  const response = await fetchImpl(`${trimSlash(config.baseUrl)}/v1/t2a_pro`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.credential}`
    },
    body: JSON.stringify({
      model: config.model,
      text,
      stream: false,
      voice_setting: { voice_id: config.voice, speed: 1.0, vol: 1.0, pitch: 0 },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: "mp3", channel: 1 }
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
