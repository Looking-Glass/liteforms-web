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

const llmProviderOptions: {
  id: LlmProviderId;
  label: string;
  defaultModel: string;
  defaultBaseUrl?: string;
}[] = [
  { id: "browser-local-gemma", label: "Gemma in browser", defaultModel: "onnx-community/gemma-4-E2B-it-ONNX" },
  { id: "openai", label: "OpenAI API", defaultModel: "gpt-4.1-mini", defaultBaseUrl: "https://api.openai.com/v1" },
  {
    id: "chatgpt-subscription",
    label: "ChatGPT connector",
    defaultModel: "gpt-5.4",
    defaultBaseUrl: "http://127.0.0.1:1455"
  },
  {
    id: "anthropic",
    label: "Anthropic API",
    defaultModel: "claude-3-5-sonnet-latest",
    defaultBaseUrl: "https://api.anthropic.com"
  },
  {
    id: "claude-subscription",
    label: "Claude connector",
    defaultModel: "claude-code",
    defaultBaseUrl: "http://127.0.0.1:1456"
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultModel: "openai/gpt-4.1-mini",
    defaultBaseUrl: "https://openrouter.ai/api/v1"
  },
  { id: "ollama", label: "Ollama", defaultModel: "llama3.2", defaultBaseUrl: "http://localhost:11434" },
  {
    id: "lmstudio",
    label: "LM Studio",
    defaultModel: "local-model",
    defaultBaseUrl: "http://localhost:1234/v1"
  },
  {
    id: "openclaw",
    label: "OpenClaw Gateway",
    defaultModel: "default",
    defaultBaseUrl: "ws://127.0.0.1:18789"
  }
];

const credentialProviders: LlmProviderId[] = [
  "openai",
  "chatgpt-subscription",
  "anthropic",
  "claude-subscription",
  "openrouter",
  "openclaw"
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
              <input value={config.model} onChange={(e) => setConfig({ ...config, model: e.target.value })} />
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
