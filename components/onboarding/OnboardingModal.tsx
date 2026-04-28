"use client";

import { useState } from "react";
import { getDefaultProviderConfig } from "@/lib/llm";
import type { BaseProviderConfig, LlmProviderId } from "@/lib/llm";
import { CREDENTIAL_PROVIDER_IDS, LLM_PROVIDER_OPTIONS } from "@/lib/llm/providerOptions";
import type { AsrConfig, AsrProviderId, TtsConfig, TtsProviderId } from "@/lib/speech";
import { TTS_PROVIDER_OPTIONS, STT_PROVIDER_OPTIONS } from "@/lib/speech/providerOptions";
import { updateEndpointMode } from "@/components/chat/chatPanelUtils";
import type { LocalModelLoadState } from "@/components/chat/ChatPanel";

type OnboardingStep = "welcome" | "llm" | "tts" | "stt" | "loading";

export type OnboardingModalProps = {
  onUseBuiltIn: () => void;
  onUseCustom: (config: BaseProviderConfig, ttsConfig: TtsConfig, asrConfig: AsrConfig) => void;
  onClose: () => void;
  localModelLoadState?: LocalModelLoadState[];
};

const llmProviderOptions = LLM_PROVIDER_OPTIONS;
const credentialProviders = CREDENTIAL_PROVIDER_IDS;

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
    const opt = TTS_PROVIDER_OPTIONS.find((p) => p.id === providerId) ?? TTS_PROVIDER_OPTIONS[0];
    if (providerId === "kokoro") {
      setTtsConfig({ provider: "kokoro" });
    } else if (providerId === "elevenlabs") {
      setTtsConfig({ provider: "elevenlabs", voiceId: opt.defaultVoice ?? "Rachel", modelId: opt.defaultModel });
    } else {
      setTtsConfig({
        provider: providerId as Exclude<TtsProviderId, "kokoro" | "elevenlabs">,
        voice: opt.defaultVoice,
        model: opt.defaultModel,
        baseUrl: opt.defaultBaseUrl
      } as TtsConfig);
    }
  }

  function updateAsrProvider(providerId: AsrProviderId) {
    const opt = STT_PROVIDER_OPTIONS.find((p) => p.id === providerId) ?? STT_PROVIDER_OPTIONS[0];
    if (providerId === "distil-whisper") {
      setAsrConfig({ provider: "distil-whisper" });
    } else if (providerId === "elevenlabs") {
      const sharedCredential =
        ttsConfig.provider === "elevenlabs" && "credential" in ttsConfig ? ttsConfig.credential : undefined;
      setAsrConfig({ provider: "elevenlabs", credential: sharedCredential, model: opt.defaultModel });
    } else {
      setAsrConfig({
        provider: providerId as Exclude<AsrProviderId, "distil-whisper" | "elevenlabs">,
        model: opt.defaultModel,
        baseUrl: opt.defaultBaseUrl
      } as AsrConfig);
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

  const ttsMeta = TTS_PROVIDER_OPTIONS.find((p) => p.id === ttsConfig.provider) ?? TTS_PROVIDER_OPTIONS[0];
  const sttMeta = STT_PROVIDER_OPTIONS.find((p) => p.id === asrConfig.provider) ?? STT_PROVIDER_OPTIONS[0];

  function getTtsVoice() {
    if (ttsConfig.provider === "elevenlabs") return ttsConfig.voiceId ?? ttsMeta.defaultVoice ?? "";
    return "voice" in ttsConfig ? (ttsConfig.voice ?? ttsMeta.defaultVoice ?? "") : "";
  }

  function setTtsVoice(voice: string) {
    if (ttsConfig.provider === "elevenlabs") {
      setTtsConfig({ ...ttsConfig, voiceId: voice });
    } else {
      setTtsConfig({ ...ttsConfig, voice } as TtsConfig);
    }
  }

  function getTtsModel() {
    if (ttsConfig.provider === "elevenlabs") return ttsConfig.modelId ?? ttsMeta.defaultModel ?? "";
    if (ttsConfig.provider === "deepgram") return ttsConfig.voice ?? ttsConfig.model ?? ttsMeta.defaultVoice ?? "";
    return "model" in ttsConfig ? (ttsConfig.model ?? ttsMeta.defaultModel ?? "") : "";
  }

  function setTtsModel(model: string) {
    if (ttsConfig.provider === "elevenlabs") {
      setTtsConfig({ ...ttsConfig, modelId: model });
    } else if (ttsConfig.provider === "deepgram") {
      setTtsConfig({ ...ttsConfig, voice: model, model });
    } else {
      setTtsConfig({ ...ttsConfig, model } as TtsConfig);
    }
  }

  function getSttModel() {
    return "model" in asrConfig ? (asrConfig.model ?? sttMeta.defaultModel ?? "") : "";
  }

  function setSttModel(model: string) {
    setAsrConfig({ ...asrConfig, model } as AsrConfig);
  }

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
            Use our free local model (Kokoro) or connect your own (ElevenLabs, OpenAI, Google, etc.).
          </p>
          <fieldset className="onboarding-fieldset" aria-label="TTS settings">
            <legend className="sr-only">TTS settings</legend>
            <label>
              Voice provider
              <select
                value={ttsConfig.provider}
                onChange={(e) => updateTtsProvider(e.target.value as TtsProviderId)}
              >
                {TTS_PROVIDER_OPTIONS.map((p) => (
                  <option key={p.id} value={p.id}>{p.label}</option>
                ))}
              </select>
            </label>
            {ttsMeta.voices ? (
              <label>
                Voice
                <select value={getTtsVoice()} onChange={(e) => setTtsVoice(e.target.value)}>
                  {ttsMeta.voices.map((v) => (
                    <option key={v.id} value={v.id}>{v.label}</option>
                  ))}
                </select>
              </label>
            ) : ttsConfig.provider !== "kokoro" ? (
              <label>
                {ttsConfig.provider === "elevenlabs" ? "Voice ID" : "Voice"}
                <input value={getTtsVoice()} onChange={(e) => setTtsVoice(e.target.value)} />
              </label>
            ) : null}
            {ttsMeta.models ? (
              <label>
                Model
                <select value={getTtsModel()} onChange={(e) => setTtsModel(e.target.value)}>
                  {ttsMeta.models.map((m) => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </select>
              </label>
            ) : ttsMeta.defaultModel !== undefined && ttsConfig.provider !== "kokoro" && ttsConfig.provider !== "deepgram" ? (
              <label>
                Model
                <input value={getTtsModel()} onChange={(e) => setTtsModel(e.target.value)} />
              </label>
            ) : null}
            {ttsMeta.needsCredential && (
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
          Use our free model (Distil-Whisper) or connect your own (OpenAI, Deepgram, ElevenLabs, etc.).
        </p>
        <fieldset className="onboarding-fieldset" aria-label="STT settings">
          <legend className="sr-only">STT settings</legend>
          <label>
            Speech input provider
            <select
              value={asrConfig.provider}
              onChange={(e) => updateAsrProvider(e.target.value as AsrProviderId)}
            >
              {STT_PROVIDER_OPTIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          {sttMeta.models ? (
            <label>
              Model
              <select value={getSttModel()} onChange={(e) => setSttModel(e.target.value)}>
                {sttMeta.models.map((m) => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </label>
          ) : sttMeta.defaultModel !== undefined && asrConfig.provider !== "distil-whisper" ? (
            <label>
              Model
              <input value={getSttModel()} onChange={(e) => setSttModel(e.target.value)} />
            </label>
          ) : null}
          {sttMeta.needsCredential && (
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
