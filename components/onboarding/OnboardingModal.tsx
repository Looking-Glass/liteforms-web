"use client";

import { useState } from "react";
import { getDefaultProviderConfig } from "@/lib/llm";
import type { BaseProviderConfig, LlmProviderId } from "@/lib/llm";
import type { AsrConfig, AsrProviderId, TtsConfig, TtsProviderId } from "@/lib/speech";
import { updateEndpointMode } from "@/components/chat/chatPanelUtils";
import type { LocalModelLoadState } from "@/components/chat/ChatPanel";

type OnboardingStep = "welcome" | "llm" | "tts" | "stt" | "loading";

export type OnboardingModalProps = {
  onUseBuiltIn: () => void;
  onUseCustom: (config: BaseProviderConfig, ttsConfig: TtsConfig, asrConfig: AsrConfig) => void;
  onClose: () => void;
  localModelLoadState?: LocalModelLoadState[];
};

type ProviderModelOption = { id: string; label: string };

const llmProviderOptions: {
  id: LlmProviderId;
  label: string;
  defaultModel: string;
  defaultBaseUrl?: string;
  /** Known model list. When present a <select> dropdown is rendered; otherwise a free-text <input>. */
  models?: ProviderModelOption[];
}[] = [
  {
    id: "browser-local-gemma",
    label: "Gemma in browser",
    defaultModel: "onnx-community/gemma-4-E2B-it-ONNX",
    models: [{ id: "onnx-community/gemma-4-E2B-it-ONNX", label: "Gemma 4 E2B (browser)" }]
  },
  {
    id: "openai",
    label: "OpenAI API",
    defaultModel: "gpt-5.5",
    defaultBaseUrl: "https://api.openai.com/v1",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" },
      { id: "gpt-5.4-mini", label: "GPT-5.4 mini" },
      { id: "gpt-5.4-nano", label: "GPT-5.4 nano" }
    ]
  },
  {
    id: "chatgpt-subscription",
    label: "ChatGPT connector",
    defaultModel: "gpt-5.5",
    defaultBaseUrl: "http://127.0.0.1:1455",
    models: [
      { id: "gpt-5.5", label: "GPT-5.5" },
      { id: "gpt-5.5-pro", label: "GPT-5.5 Pro" },
      { id: "gpt-5.4", label: "GPT-5.4" },
      { id: "gpt-5.4-pro", label: "GPT-5.4 Pro" }
    ]
  },
  {
    id: "anthropic",
    label: "Anthropic API",
    defaultModel: "claude-opus-4-7",
    defaultBaseUrl: "https://api.anthropic.com",
    models: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" },
      { id: "claude-haiku-3-5", label: "Claude Haiku 3.5" }
    ]
  },
  {
    id: "claude-subscription",
    label: "Claude connector",
    defaultModel: "claude-opus-4-7",
    defaultBaseUrl: "http://127.0.0.1:1456",
    models: [
      { id: "claude-opus-4-7", label: "Claude Opus 4.7" },
      { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
      { id: "claude-opus-4-6", label: "Claude Opus 4.6" },
      { id: "claude-opus-4-5", label: "Claude Opus 4.5" },
      { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5" },
      { id: "claude-haiku-4-5", label: "Claude Haiku 4.5" }
    ]
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "openai/gpt-4.1-mini",
    defaultBaseUrl: "https://openrouter.ai/api/v1"
    // No static model list — OpenRouter is a gateway to thousands of models
  },
  {
    id: "ollama",
    label: "Ollama",
    defaultModel: "llama3.2",
    defaultBaseUrl: "http://localhost:11434"
    // No static model list — models are installed locally
  },
  {
    id: "lmstudio",
    label: "LM Studio",
    defaultModel: "local-model",
    defaultBaseUrl: "http://localhost:1234/v1"
    // No static model list — models are loaded locally in LM Studio
  },
  {
    id: "openclaw",
    label: "OpenClaw Gateway",
    defaultModel: "default",
    defaultBaseUrl: "ws://127.0.0.1:18789"
    // No static model list — OpenClaw routes to whichever provider is configured
  },
  {
    id: "google",
    label: "Google AI Studio",
    defaultModel: "gemini-3.1-pro-preview",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: [
      { id: "gemini-3.1-pro-preview", label: "Gemini 3.1 Pro" },
      { id: "gemini-3.1-flash-lite-preview", label: "Gemini 3.1 Flash Lite" },
      { id: "gemini-3-flash-preview", label: "Gemini 3 Flash" },
      { id: "gemini-3-pro-preview", label: "Gemini 3 Pro" },
      { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
      { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite" },
      { id: "gemini-pro-latest", label: "Gemini Pro (latest)" },
      { id: "gemini-flash-latest", label: "Gemini Flash (latest)" }
    ]
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    defaultModel: "grok-4",
    defaultBaseUrl: "https://api.x.ai/v1",
    models: [
      { id: "grok-4", label: "Grok 4" },
      { id: "grok-4-fast", label: "Grok 4 Fast" },
      { id: "grok-4-1-fast", label: "Grok 4.1 Fast" },
      { id: "grok-4.20-beta-latest-reasoning", label: "Grok 4.20 Beta (Reasoning)" },
      { id: "grok-4.20-beta-latest-non-reasoning", label: "Grok 4.20 Beta" },
      { id: "grok-3", label: "Grok 3" },
      { id: "grok-3-fast", label: "Grok 3 Fast" },
      { id: "grok-3-mini", label: "Grok 3 Mini" }
    ]
  },
  {
    id: "mistral",
    label: "Mistral AI",
    defaultModel: "mistral-large-latest",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    models: [
      { id: "mistral-large-latest", label: "Mistral Large" },
      { id: "mistral-medium-2508", label: "Mistral Medium 3.1" },
      { id: "mistral-small-latest", label: "Mistral Small" },
      { id: "magistral-small", label: "Magistral Small" },
      { id: "codestral-latest", label: "Codestral" },
      { id: "devstral-medium-latest", label: "Devstral 2" },
      { id: "pixtral-large-latest", label: "Pixtral Large" }
    ]
  },
  {
    id: "cerebras",
    label: "Cerebras",
    defaultModel: "gpt-oss-120b",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    models: [
      { id: "gpt-oss-120b", label: "GPT OSS 120B" },
      { id: "zai-glm-4.7", label: "Z.ai GLM 4.7" },
      { id: "qwen-3-235b-a22b-instruct-2507", label: "Qwen 3 235B" },
      { id: "llama3.1-8b", label: "Llama 3.1 8B" }
    ]
  },
  {
    id: "nvidia",
    label: "NVIDIA",
    defaultModel: "nvidia/nemotron-3-super-120b-a12b",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    models: [
      { id: "nvidia/nemotron-3-super-120b-a12b", label: "Nemotron 3 Super 120B" },
      { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5" },
      { id: "minimaxai/minimax-m2.5", label: "MiniMax M2.5" },
      { id: "z-ai/glm5", label: "GLM-5" }
    ]
  },
  {
    id: "groq",
    label: "Groq",
    defaultModel: "llama-3.3-70b-versatile",
    defaultBaseUrl: "https://api.groq.com/openai/v1"
    // No static model list — Groq models are fetched dynamically from the API
  },
  {
    id: "together",
    label: "Together AI",
    defaultModel: "meta-llama/Llama-3.3-70B-Instruct-Turbo",
    defaultBaseUrl: "https://api.together.xyz/v1"
    // No static model list — Together AI hosts hundreds of open models
  },
  {
    id: "fireworks",
    label: "Fireworks",
    defaultModel: "accounts/fireworks/models/llama-v3p3-70b-instruct",
    defaultBaseUrl: "https://api.fireworks.ai/inference/v1"
    // No static model list — Fireworks hosts hundreds of open models
  },
  {
    id: "qwen",
    label: "Qwen Cloud",
    defaultModel: "qwen-plus",
    defaultBaseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1"
    // No static model list — Qwen model availability varies by plan/region
  }
];

const credentialProviders: LlmProviderId[] = [
  "openai",
  "chatgpt-subscription",
  "anthropic",
  "claude-subscription",
  "openrouter",
  "openclaw",
  "google",
  "xai",
  "mistral",
  "cerebras",
  "nvidia",
  "groq",
  "together",
  "fireworks",
  "qwen"
];

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="onboarding-step-indicator" aria-label={`Step ${current} of ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <span
          key={i}
          className={`onboarding-step-dot${i + 1 === current ? " active" : i + 1 < current ? " done" : ""}`}
        />
      ))}
    </div>
  );
}

export function OnboardingModal({ onUseBuiltIn, onUseCustom, onClose, localModelLoadState }: OnboardingModalProps) {
  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [config, setConfig] = useState<BaseProviderConfig>(getDefaultProviderConfig());
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>({ provider: "kokoro" });
  const [asrConfig, setAsrConfig] = useState<AsrConfig>({ provider: "distil-whisper" });

  function updateLlmProvider(providerId: LlmProviderId) {
    const option = llmProviderOptions.find((p) => p.id === providerId) ?? llmProviderOptions[0];
    setConfig({
      provider: option.id,
      model: option.defaultModel,
      baseUrl: option.defaultBaseUrl,
      endpointMode: updateEndpointMode(option.id)
    });
  }

  function updateTtsProvider(providerId: TtsProviderId) {
    if (providerId === "kokoro") {
      setTtsConfig({ provider: "kokoro" });
    } else if (providerId === "elevenlabs") {
      setTtsConfig({ provider: "elevenlabs", voiceId: "Rachel" });
    } else {
      setTtsConfig({ provider: "deepgram", voice: "aura-asteria-en", model: "aura-asteria-en" });
    }
  }

  function updateAsrProvider(providerId: AsrProviderId) {
    if (providerId === "distil-whisper") {
      setAsrConfig({ provider: "distil-whisper" });
    } else if (providerId === "deepgram") {
      setAsrConfig({ provider: "deepgram" });
    } else {
      // ElevenLabs – share credential if TTS is also ElevenLabs
      const sharedCredential =
        ttsConfig.provider === "elevenlabs" && "credential" in ttsConfig ? ttsConfig.credential : undefined;
      setAsrConfig({ provider: "elevenlabs", credential: sharedCredential });
    }
  }

  function handleBuiltIn() {
    setStep("loading");
    onUseBuiltIn();
  }

  function handleCustomStart() {
    setStep("loading");
    onUseCustom(config, ttsConfig, asrConfig);
  }

  const allModelsReady =
    !!localModelLoadState &&
    localModelLoadState.length > 0 &&
    localModelLoadState.every((m) => m.status === "ready" || m.status === "error");

  const providerMeta = llmProviderOptions.find((p) => p.id === config.provider) ?? llmProviderOptions[0];
  const showEndpoint = config.provider !== "browser-local-gemma";
  const showCredential = credentialProviders.includes(config.provider);

  // ── Welcome ────────────────────────────────────────────────────────────────

  if (step === "welcome") {
    return (
      <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Liteforms">
        <div className="onboarding-modal">
          <h2 className="onboarding-title">Welcome to Liteforms</h2>
          <p className="onboarding-intro">
            You can use Liteforms with our built-in free configuration or connect it to your own provider (OpenClaw,
            ChatGPT, Anthropic, etc.)
          </p>
          <div className="onboarding-actions">
            <button type="button" className="onboarding-primary" onClick={handleBuiltIn}>
              Built-in models (300mb download)
            </button>
            <button type="button" className="onboarding-secondary" onClick={() => setStep("llm")}>
              Custom configuration
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (step === "loading") {
    const models = localModelLoadState ?? [];
    const overallProgress =
      models.length > 0 ? Math.round(models.reduce((sum, m) => sum + m.progress, 0) / models.length) : 0;

    return (
      <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Loading models">
        <div className="onboarding-modal">
          <h2 className="onboarding-title">Downloading models…</h2>
          <p className="onboarding-intro">
            Gemma, Kokoro, and Distil-Whisper are downloading. They&apos;ll be cached so this only happens once.
          </p>
          <progress className="onboarding-progress" value={overallProgress} max={100} />
          <div className="onboarding-model-list">
            {models.map((m) => (
              <div className="onboarding-model-row" key={m.id}>
                <span>{m.label}</span>
                <span className={`onboarding-model-status ${m.status}`}>{m.message}</span>
              </div>
            ))}
          </div>
          <div className="onboarding-footer onboarding-footer--end">
            <button type="button" className="onboarding-primary" disabled={!allModelsReady} onClick={onClose}>
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── LLM ───────────────────────────────────────────────────────────────────

  if (step === "llm") {
    return (
      <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Select LLM">
        <div className="onboarding-modal onboarding-modal--wide">
          <StepIndicator current={1} total={3} />
          <h2 className="onboarding-title">Select LLM (the brain)</h2>
          <p className="onboarding-intro">
            Use our default model (free) or connect your own (OpenClaw, OpenAI, Anthropic, etc.).
          </p>
          <fieldset className="onboarding-fieldset" aria-label="LLM settings">
            <legend className="sr-only">LLM settings</legend>
            <label>
              Model provider
              <select value={config.provider} onChange={(e) => updateLlmProvider(e.target.value as LlmProviderId)}>
                {llmProviderOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Model
              {providerMeta.models ? (
                <select value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })}>
                  {providerMeta.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              ) : (
                <input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} />
              )}
            </label>
            {showEndpoint && (
              <label>
                Endpoint
                <input
                  value={config.baseUrl ?? providerMeta.defaultBaseUrl ?? ""}
                  onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
                />
              </label>
            )}
            {showCredential && (
              <label>
                Credential
                <input
                  type="password"
                  value={config.credential ?? ""}
                  onChange={(e) => setConfig({ ...config, credential: e.target.value })}
                  placeholder="Browser-local only"
                />
              </label>
            )}
          </fieldset>
          <div className="onboarding-footer">
            <button type="button" className="onboarding-back" onClick={() => setStep("welcome")}>
              Back
            </button>
            <button type="button" className="onboarding-primary" onClick={() => setStep("tts")}>
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── TTS ───────────────────────────────────────────────────────────────────

  if (step === "tts") {
    return (
      <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Select text-to-speech">
        <div className="onboarding-modal onboarding-modal--wide">
          <StepIndicator current={2} total={3} />
          <h2 className="onboarding-title">Select text-to-speech (the voice)</h2>
          <p className="onboarding-intro">
            Use our free local model (Kokoro) or connect your own (ElevenLabs, Deepgram, etc.).
          </p>
          <fieldset className="onboarding-fieldset" aria-label="TTS settings">
            <legend className="sr-only">TTS settings</legend>
            <label>
              Voice
              <select
                value={ttsConfig.provider}
                onChange={(e) => updateTtsProvider(e.target.value as TtsProviderId)}
              >
                <option value="kokoro">Kokoro</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="deepgram">Deepgram TTS</option>
              </select>
            </label>
            {ttsConfig.provider === "elevenlabs" && (
              <label>
                ElevenLabs voice ID
                <input
                  value={ttsConfig.voiceId ?? "Rachel"}
                  onChange={(e) => setTtsConfig({ ...ttsConfig, voiceId: e.target.value })}
                />
              </label>
            )}
            {ttsConfig.provider === "deepgram" && (
              <label>
                Deepgram voice model
                <input
                  value={ttsConfig.voice ?? ttsConfig.model ?? "aura-asteria-en"}
                  onChange={(e) => setTtsConfig({ ...ttsConfig, voice: e.target.value, model: e.target.value })}
                />
              </label>
            )}
            {ttsConfig.provider !== "kokoro" && (
              <label>
                Voice credential
                <input
                  type="password"
                  value={"credential" in ttsConfig ? (ttsConfig.credential ?? "") : ""}
                  onChange={(e) => setTtsConfig({ ...ttsConfig, credential: e.target.value } as TtsConfig)}
                  placeholder="Browser-local only"
                />
              </label>
            )}
          </fieldset>
          <div className="onboarding-footer">
            <button type="button" className="onboarding-back" onClick={() => setStep("llm")}>
              Back
            </button>
            <button type="button" className="onboarding-primary" onClick={() => setStep("stt")}>
              Next
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STT ───────────────────────────────────────────────────────────────────

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Select speech-to-text">
      <div className="onboarding-modal onboarding-modal--wide">
        <StepIndicator current={3} total={3} />
        <h2 className="onboarding-title">Select speech-to-text (the ears)</h2>
        <p className="onboarding-intro">
          Use our free model (Distil-Whisper) or connect your own (ElevenLabs, Deepgram, etc.).
        </p>
        <fieldset className="onboarding-fieldset" aria-label="STT settings">
          <legend className="sr-only">STT settings</legend>
          <label>
            Speech input
            <select
              value={asrConfig.provider}
              onChange={(e) => updateAsrProvider(e.target.value as AsrProviderId)}
            >
              <option value="distil-whisper">Distil-Whisper</option>
              <option value="deepgram">Deepgram STT</option>
              <option value="elevenlabs">ElevenLabs STT</option>
            </select>
          </label>
          {asrConfig.provider !== "distil-whisper" && (
            <label>
              Transcription credential
              <input
                type="password"
                value={"credential" in asrConfig ? (asrConfig.credential ?? "") : ""}
                onChange={(e) => setAsrConfig({ ...asrConfig, credential: e.target.value } as AsrConfig)}
                placeholder="Browser-local only"
              />
            </label>
          )}
        </fieldset>
        <div className="onboarding-footer">
          <button type="button" className="onboarding-back" onClick={() => setStep("tts")}>
            Back
          </button>
          <button type="button" className="onboarding-primary" onClick={handleCustomStart}>
            Start Liteforms
          </button>
        </div>
      </div>
    </div>
  );
}
