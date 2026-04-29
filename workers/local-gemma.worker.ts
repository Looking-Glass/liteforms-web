import type { ChatMessage, LocalGemmaWorkerRequest } from "@/lib/llm";
import { extractGeneratedText, formatGemma4Messages, formatPromptMessages, getLocalModelRuntimeOptions } from "./local-gemma-helpers";
import { configureTransformersBrowserCache } from "./transformers-cache";

type WorkerMessage = {
  id: number;
  type: "generate" | "preload";
  payload: LocalGemmaWorkerRequest | Pick<LocalGemmaWorkerRequest, "model">;
};

type TextGenerator = (prompt: string | ChatMessage[], options: Record<string, unknown>) => Promise<unknown>;
type ProgressInfo = {
  status?: string;
  progress?: number;
  file?: string;
  name?: string;
  message?: string;
  loaded?: number;
  total?: number;
};

const workerScope = self as unknown as {
  addEventListener(type: "message", listener: (event: MessageEvent<WorkerMessage>) => void): void;
  postMessage(message: unknown): void;
};

const generatorCache = new Map<string, Promise<TextGenerator>>();

workerScope.addEventListener("message", async (event: MessageEvent<WorkerMessage>) => {
  const { id, type, payload } = event.data;
  if (type !== "generate" && type !== "preload") {
    workerScope.postMessage({ id, ok: false, error: "Unsupported local Gemma worker request." });
    return;
  }

  try {
    const generator = await getGenerator(payload.model, (progress) => postProgress(id, progress));
    if (type === "preload") {
      // Ready + 100% is applied on the main thread when preload() resolves — avoid a
      // duplicate progress message so the UI does not show 100% while still awaiting init.
      workerScope.postMessage({ id, ok: true, result: "" });
      return;
    }
    const generatePayload = payload as LocalGemmaWorkerRequest;
    const onToken = (text: string) => {
      if (text) workerScope.postMessage({ id, type: "token", text });
    };
    const output = await generator(formatPromptMessages(generatePayload.messages), {
      max_new_tokens: generatePayload.maxNewTokens ?? 256,
      do_sample: true,
      temperature: 0.7,
      return_full_text: false,
      onToken
    });
    workerScope.postMessage({ id, ok: true, result: extractGeneratedText(output) });
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : "Browser-local Gemma generation failed.";
    workerScope.postMessage({ id, ok: false, error: message });
  }
});

function getGenerator(model: string, onProgress?: (progress: ProgressInfo) => void) {
  const existing = generatorCache.get(model);
  if (existing) {
    return existing;
  }
  const created = createGenerator(model, onProgress);
  generatorCache.set(model, created);
  return created;
}

async function createGenerator(model: string, onProgress?: (progress: ProgressInfo) => void): Promise<TextGenerator> {
  const transformers = (await import("@huggingface/transformers")) as Record<string, unknown>;
  // Aggregate per-file (loaded, total) byte counts into a single overall percentage so the
  // UI sees one monotonic-ish curve instead of each file restarting from 0%. Transformers.js
  // emits per-file progress events; we accumulate them here and forward an aggregate.
  const aggregateOnProgress = onProgress ? createAggregatingProgress(onProgress) : undefined;
  configureTransformersBrowserCache(transformers, "Gemma", aggregateOnProgress);
  if (model.toLowerCase().includes("gemma-4")) {
    return createGemma4Generator(model, transformers, aggregateOnProgress);
  }
  const pipeline = transformers.pipeline as (task: string, model: string, options: Record<string, unknown>) => Promise<TextGenerator>;
  return pipeline("text-generation", model, {
    ...getLocalModelRuntimeOptions(model),
    progress_callback: aggregateOnProgress
  });
}

function createAggregatingProgress(onProgress: (progress: ProgressInfo) => void): (info: ProgressInfo) => void {
  const fileBytes = new Map<string, { loaded: number; total: number }>();
  return (info) => {
    const file = info.file ?? info.name;
    if (file && typeof info.loaded === "number" && typeof info.total === "number" && info.total > 0) {
      fileBytes.set(file, { loaded: info.loaded, total: info.total });
    } else if (file && info.status === "done") {
      const existing = fileBytes.get(file);
      if (existing) fileBytes.set(file, { loaded: existing.total, total: existing.total });
    }
    let totalLoaded = 0;
    let totalExpected = 0;
    for (const v of fileBytes.values()) {
      totalLoaded += v.loaded;
      totalExpected += v.total;
    }
    const aggregate =
      totalExpected > 0 ? Math.min(100, (totalLoaded / totalExpected) * 100) : info.progress;
    onProgress({ ...info, progress: aggregate });
  };
}

type TextStreamerCtor = new (
  tokenizer: unknown,
  options: { skip_prompt?: boolean; skip_special_tokens?: boolean; callback_function?: (text: string) => void }
) => unknown;

async function createGemma4Generator(modelId: string, transformers: Record<string, unknown>, onProgress?: (progress: ProgressInfo) => void): Promise<TextGenerator> {
  const AutoProcessor = transformers.AutoProcessor as { from_pretrained(model: string, options?: Record<string, unknown>): Promise<GemmaProcessor> } | undefined;
  const Gemma4ForConditionalGeneration = transformers.Gemma4ForConditionalGeneration as
    | { from_pretrained(model: string, options?: Record<string, unknown>): Promise<Gemma4Model> }
    | undefined;
  const TextStreamer = transformers.TextStreamer as TextStreamerCtor | undefined;

  if (!AutoProcessor || !Gemma4ForConditionalGeneration) {
    throw new Error("Gemma 4 requires a Transformers.js build with Gemma4ForConditionalGeneration support.");
  }

  const processor = await AutoProcessor.from_pretrained(modelId, { progress_callback: onProgress });
  const model = await Gemma4ForConditionalGeneration.from_pretrained(modelId, {
    ...getLocalModelRuntimeOptions(modelId),
    progress_callback: onProgress
  });

  return async (messages, options) => {
    const prompt = processor.apply_chat_template(formatGemma4Messages(messages), {
      add_generation_prompt: true,
      tokenize: false
    });
    const inputs = await processor(prompt, undefined, undefined, { add_special_tokens: false });

    // Build a TextStreamer if the API is available and an onToken callback was
    // provided. Pass the processor's tokenizer if accessible, falling back to
    // the processor itself. Wrap construction in try-catch so an incompatible
    // Transformers.js build degrades gracefully to the non-streaming path.
    const onToken = options.onToken as ((text: string) => void) | undefined;
    let streamer: unknown = undefined;
    if (TextStreamer && onToken) {
      try {
        const tokenizer = (processor as unknown as { tokenizer?: unknown }).tokenizer ?? processor;
        streamer = new TextStreamer(tokenizer, {
          skip_prompt: true,
          skip_special_tokens: true,
          callback_function: onToken
        });
      } catch {
        streamer = undefined;
      }
    }

    const outputs = await model.generate({
      ...inputs,
      max_new_tokens: options.max_new_tokens,
      do_sample: options.do_sample,
      temperature: options.temperature,
      ...(streamer ? { streamer } : {})
    });

    // When streaming, tokens were already emitted via callback — return empty so
    // the caller doesn't double-yield a concatenated string.
    if (streamer) return "";

    const inputLength = getInputLength(inputs);
    const outputTensor = outputs as { slice?: (start: unknown, end: unknown) => unknown };
    const generated = typeof outputTensor?.slice === "function" ? outputTensor.slice(null, [inputLength, null]) : outputs;
    const decoded = processor.batch_decode(generated, { skip_special_tokens: true });
    return decoded[0] ?? "";
  };
}

type GemmaProcessor = {
  apply_chat_template(messages: unknown, options: Record<string, unknown>): string;
  batch_decode(outputs: unknown, options: Record<string, unknown>): string[];
  (prompt: string, image?: unknown, audio?: unknown, options?: Record<string, unknown>): Promise<Record<string, unknown>>;
};

type Gemma4Model = {
  generate(inputs: Record<string, unknown>): Promise<{ slice?: (start: unknown, end: unknown) => unknown } | unknown>;
};

function getInputLength(inputs: Record<string, unknown>) {
  const inputIds = inputs.input_ids as { dims?: number[] } | undefined;
  return inputIds?.dims?.at(-1) ?? 0;
}

function postProgress(id: number, info: ProgressInfo) {
  const file = info.file ?? info.name;
  const progress =
    typeof info.progress === "number" ? Math.max(0, Math.min(100, info.progress)) : undefined;
  workerScope.postMessage({
    id,
    type: "progress",
    progress: {
      status: "loading",
      ...(progress !== undefined ? { progress } : {}),
      message: info.message ?? (file ? `Gemma ${file}` : "Gemma loading")
    }
  });
}

export {};
