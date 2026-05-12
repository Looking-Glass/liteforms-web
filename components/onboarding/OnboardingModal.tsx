"use client";

import { useState } from "react";
import { getDefaultProviderConfig } from "@/lib/llm";
import type { BaseProviderConfig, LlmProviderId } from "@/lib/llm";
import { CREDENTIAL_PROVIDER_IDS, getVisibleLlmProviderOptions, isVercelDeploymentFromEnv } from "@/lib/llm/providerOptions";
import type { AsrConfig, AsrProviderId, RealtimeVoiceConfig, TtsConfig, TtsProviderId } from "@/lib/speech";
import { getVisibleTtsProviderOptions, getVisibleSttProviderOptions } from "@/lib/speech/providerOptions";
import { updateEndpointMode } from "@/components/chat/chatPanelUtils";
import { OpenClawSetupHint } from "@/components/openclaw/OpenClawSetupHint";
import {
  OPENCLAW_GATEWAY_TOKEN_HELP,
  OPENCLAW_GATEWAY_TOKEN_LABEL,
  OPENCLAW_GATEWAY_TOKEN_PLACEHOLDER
} from "@/lib/llm/openclawSetup";
import { defaultLocalAuthMethod, getLocalAuthCopy, type LocalAuthLoginResult, type LocalAuthProviderId } from "@/lib/llm/localAuth";
import type { LocalModelLoadState } from "@/components/chat/ChatPanel";

type OnboardingStep = "welcome" | "llm" | "tts" | "stt" | "loading";

// Set to false to restore the welcome screen that lets users choose between
// built-in models and custom configuration.
const SKIP_WELCOME_SCREEN = true;

export type OnboardingModalProps = {
  onUseBuiltIn: () => void;
  onUseCustom: (config: BaseProviderConfig, ttsConfig: TtsConfig, asrConfig: AsrConfig, realtimeVoiceConfig?: RealtimeVoiceConfig) => void;
  onClose: () => void;
  localModelLoadState?: LocalModelLoadState[];
  /** Pre-populate fields and skip the welcome screen (used by the Settings Configure button). */
  mode?: "configure";
  initialLlmConfig?: BaseProviderConfig;
  initialTtsConfig?: TtsConfig;
  initialAsrConfig?: AsrConfig;
  initialRealtimeVoiceConfig?: RealtimeVoiceConfig;
  /** Test seam for deployment-specific provider filtering; production derives this from Next/Vercel env. */
  isVercelDeployment?: boolean;
};

const credentialProviders = CREDENTIAL_PROVIDER_IDS;

function isRealtimeVoiceProvider(provider: string): provider is "google-live" | "openai-realtime" {
  return provider === "google-live" || provider === "openai-realtime";
}

function isActiveRealtimeVoiceConfig(config: RealtimeVoiceConfig): config is Exclude<RealtimeVoiceConfig, { provider: "none" }> {
  return isRealtimeVoiceProvider(config.provider);
}

function defaultRealtimeVoice(provider: "google-live" | "openai-realtime", option: { defaultModel: string; defaultVoice?: string; defaultBaseUrl?: string }, credential?: string): RealtimeVoiceConfig {
  return {
    provider,
    credential,
    model: option.defaultModel,
    voice: option.defaultVoice,
    websocketUrl: option.defaultBaseUrl
  };
}

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

export function OnboardingModal({
  onUseBuiltIn,
  onUseCustom,
  onClose,
  localModelLoadState,
  mode,
  initialLlmConfig,
  initialTtsConfig,
  initialAsrConfig,
  initialRealtimeVoiceConfig,
  isVercelDeployment = isVercelDeploymentFromEnv()
}: OnboardingModalProps) {
  const llmProviderOptions = getVisibleLlmProviderOptions({ isVercelDeployment });
  const ttsProviderOptions = getVisibleTtsProviderOptions();
  const sttProviderOptions = getVisibleSttProviderOptions();
  const defaultInitialConfig: BaseProviderConfig = {
    provider: "anthropic",
    model: "claude-opus-4-7",
    baseUrl: "https://api.anthropic.com",
    endpointMode: "native"
  };
  const visibleInitialLlmConfig =
    initialLlmConfig && llmProviderOptions.some((provider) => provider.id === initialLlmConfig.provider)
      ? initialLlmConfig
      : undefined;
  const [step, setStep] = useState<OnboardingStep>(
    mode === "configure" || SKIP_WELCOME_SCREEN ? "llm" : "welcome"
  );
  const [config, setConfig] = useState<BaseProviderConfig>(
    visibleInitialLlmConfig ?? defaultInitialConfig
  );
  const [ttsConfig, setTtsConfig] = useState<TtsConfig>(initialTtsConfig ?? { provider: "kokoro" });
  const [asrConfig, setAsrConfig] = useState<AsrConfig>(initialAsrConfig ?? { provider: "distil-whisper" });
  const [realtimeVoiceConfig, setRealtimeVoiceConfig] = useState<RealtimeVoiceConfig>(
    initialRealtimeVoiceConfig ??
      (visibleInitialLlmConfig?.provider === "google-live"
        ? {
            provider: "google-live",
            credential: visibleInitialLlmConfig.credential,
            model: visibleInitialLlmConfig.model,
            voice: "Kore",
            websocketUrl: visibleInitialLlmConfig.baseUrl
          }
        : visibleInitialLlmConfig?.provider === "openai-realtime"
          ? {
              provider: "openai-realtime",
              credential: visibleInitialLlmConfig.credential,
              model: visibleInitialLlmConfig.model,
              voice: "coral",
              websocketUrl: visibleInitialLlmConfig.baseUrl
            }
        : { provider: "none" })
  );
  const [localAuthStatus, setLocalAuthStatus] = useState<LocalAuthLoginResult | null>(null);
  const [localAuthBusy, setLocalAuthBusy] = useState(false);
  const [localAuthError, setLocalAuthError] = useState("");

  function updateLlmProvider(providerId: LlmProviderId) {
    const option = llmProviderOptions.find((p) => p.id === providerId) ?? llmProviderOptions[0];
    if (isRealtimeVoiceProvider(option.id)) {
      const credential =
        (option.id === "google-live" && config.provider === "google") || (option.id === "openai-realtime" && config.provider === "openai")
          ? config.credential
          : undefined;
      setRealtimeVoiceConfig(defaultRealtimeVoice(option.id, option, credential));
      setConfig({
        provider: option.id,
        credential,
        model: option.defaultModel,
        baseUrl: option.defaultBaseUrl,
        endpointMode: updateEndpointMode(option.id)
      });
      return;
    }
    setRealtimeVoiceConfig({ provider: "none" });
    setLocalAuthStatus(null);
    setLocalAuthError("");
    setConfig({
      provider: option.id,
      model: option.defaultModel,
      baseUrl: option.defaultBaseUrl,
      endpointMode: updateEndpointMode(option.id)
    });
  }

  function updateTtsProvider(providerId: TtsProviderId) {
    const opt = ttsProviderOptions.find((p) => p.id === providerId) ?? ttsProviderOptions[0];
    if (providerId === "kokoro") {
      setTtsConfig({ provider: "kokoro" });
      setRealtimeVoiceConfig({ provider: "none" });
    } else if (providerId === "elevenlabs") {
      setTtsConfig({ provider: "elevenlabs", voiceId: opt.defaultVoice ?? "CwhRBWXzGAHq8TQ4Fs17", modelId: opt.defaultModel });
      setRealtimeVoiceConfig({ provider: "none" });
    } else {
      setTtsConfig({
        provider: providerId as Exclude<TtsProviderId, "kokoro" | "elevenlabs">,
        voice: opt.defaultVoice,
        model: opt.defaultModel,
        baseUrl: opt.defaultBaseUrl
      } as TtsConfig);
      setRealtimeVoiceConfig({ provider: "none" });
    }
  }

  function updateAsrProvider(providerId: AsrProviderId) {
    const opt = sttProviderOptions.find((p) => p.id === providerId) ?? sttProviderOptions[0];
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
    const usesRealtimeVoice = isRealtimeVoiceProvider(config.provider) || isActiveRealtimeVoiceConfig(realtimeVoiceConfig);
    const needsLocalModels =
      config.provider === "browser-local-gemma" ||
      config.provider === "browser-local-qwen" ||
      (!usesRealtimeVoice && ttsConfig.provider === "kokoro") ||
      (!usesRealtimeVoice && asrConfig.provider === "distil-whisper");

    if (mode === "configure" && !needsLocalModels) {
      // All-cloud config: nothing to download, save and close immediately.
      submitCustomConfig();
      onClose();
      return;
    }
    // Show the loading step so the user can see download/cache-check progress.
    setStep("loading");
    submitCustomConfig();
  }

  function submitCustomConfig() {
    if (!isRealtimeVoiceProvider(config.provider) && realtimeVoiceConfig.provider === "none") {
      onUseCustom(config, ttsConfig, asrConfig);
      return;
    }
    onUseCustom(config, ttsConfig, asrConfig, realtimeVoiceConfig);
  }

  const allModelsReady =
    !!localModelLoadState &&
    localModelLoadState.length > 0 &&
    localModelLoadState.every((m) => m.status === "ready" || m.status === "error");

  const providerMeta = llmProviderOptions.find((p) => p.id === config.provider) ?? llmProviderOptions[0];
  const showEndpoint = config.provider !== "browser-local-gemma" && config.provider !== "browser-local-qwen";
  const showCredential = credentialProviders.includes(config.provider);
  const isOpenAiCodex = config.provider === "openai-codex";
  const isClaudeCli = config.provider === "claude-cli";
  const localAuthProvider: LocalAuthProviderId | null = isOpenAiCodex ? "openai-codex" : isClaudeCli ? "claude-cli" : null;
  const localAuthCopy = localAuthProvider ? getLocalAuthCopy(localAuthProvider) : null;

  const ttsMeta = ttsProviderOptions.find((p) => p.id === ttsConfig.provider) ?? ttsProviderOptions[0];
  const sttMeta = sttProviderOptions.find((p) => p.id === asrConfig.provider) ?? sttProviderOptions[0];

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

  async function requestLocalAuth(action: "status" | "login") {
    if (!localAuthProvider || !config.baseUrl) return;
    setLocalAuthBusy(true);
    setLocalAuthError("");
    try {
      const response = await fetch("/api/llm/local-auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          provider: localAuthProvider,
          baseUrl: config.baseUrl,
          method: defaultLocalAuthMethod(localAuthProvider)
        })
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(typeof body?.error === "string" ? body.error : `Local auth failed with ${response.status}`);
      }
      setLocalAuthStatus(body);
      if (typeof body?.verificationUrl === "string") {
        window.open(body.verificationUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      setLocalAuthError(error instanceof Error ? error.message : "Local auth failed.");
    } finally {
      setLocalAuthBusy(false);
    }
  }

  // ── Welcome ────────────────────────────────────────────────────────────────

  if (step === "welcome") {
    return (
      <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Welcome to Liteforms">
        <div className="onboarding-modal">
          <h2 className="onboarding-title">Welcome to Liteforms</h2>
          <p className="onboarding-intro">
            Use the built-in free models or connect your own provider (OpenClaw, ChatGPT, Anthropic, etc.)
          </p>
          <div className="onboarding-actions">
            <button type="button" className="onboarding-primary" onClick={handleBuiltIn}>
              Built-in models — free
            </button>
            <button type="button" className="onboarding-secondary" onClick={() => setStep("llm")}>
              Custom configuration
            </button>
          </div>
          <p className="onboarding-warning">
            Built-in models download ~250 MB to your browser cache. This only happens once, but may take a few minutes on slower connections.
          </p>
        </div>
      </div>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (step === "loading") {
    // Only show models that are actually being downloaded/used (not "Not used" ones).
    const models = (localModelLoadState ?? []).filter((m) => m.message !== "Not used");
    // Show overall preload progress across the local model queue.
    const currentProgress =
      models.length > 0 ? models.reduce((sum, model) => sum + model.progress, 0) / models.length : 0;
    // Drop trailing zero (e.g. 50 -> "50%", 13.6789 -> "13.7%").
    const displayProgress = parseFloat(currentProgress.toFixed(1));

    return (
      <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Loading models">
        <div className="onboarding-modal">
          <h2 className="onboarding-title">Downloading models…</h2>
          <p className="onboarding-intro">
            Local models downloading to your browser cache. This only happens once — grab a coffee if your connection is slow.
          </p>
          <div className="onboarding-model-queue" aria-live="polite">
            {models.map((m) => (
              <div key={m.id} className={`onboarding-queue-item onboarding-queue-item--${m.status}`}>
                {m.label}
              </div>
            ))}
          </div>
          {allModelsReady && (
            <p className="onboarding-ready-message">All models ready</p>
          )}
          <progress className="onboarding-progress" value={currentProgress} max={100} aria-label={`${displayProgress}% complete`} />
          <div className="onboarding-footer onboarding-footer--end">
            <button type="button" className="onboarding-primary" disabled={!allModelsReady} onClick={onClose}>
              {allModelsReady ? "Continue →" : `${displayProgress}%`}
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
            {config.provider !== "browser-local-gemma" && config.provider !== "browser-local-qwen" && (
              <label>
                Model
                {providerMeta.models ? (
                  <select
                    value={config.model}
                    onChange={(e) => {
                      setConfig({ ...config, model: e.target.value });
                      if (isRealtimeVoiceProvider(config.provider) && isActiveRealtimeVoiceConfig(realtimeVoiceConfig)) {
                        setRealtimeVoiceConfig({ ...realtimeVoiceConfig, model: e.target.value });
                      }
                    }}
                  >
                    {providerMeta.models.map((m) => (
                      <option key={m.id} value={m.id}>{m.label}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={config.model}
                    onChange={(e) => {
                      setConfig({ ...config, model: e.target.value });
                      if (isRealtimeVoiceProvider(config.provider) && isActiveRealtimeVoiceConfig(realtimeVoiceConfig)) {
                        setRealtimeVoiceConfig({ ...realtimeVoiceConfig, model: e.target.value });
                      }
                    }}
                  />
                )}
              </label>
            )}
            {isRealtimeVoiceProvider(config.provider) && providerMeta.voices && isActiveRealtimeVoiceConfig(realtimeVoiceConfig) && (
              <label>
                Voice
                <select
                  value={realtimeVoiceConfig.voice ?? providerMeta.defaultVoice ?? "Kore"}
                  onChange={(e) => setRealtimeVoiceConfig({ ...realtimeVoiceConfig, voice: e.target.value })}
                >
                  {providerMeta.voices.map((voice) => (
                    <option key={voice.id} value={voice.id}>{voice.label}</option>
                  ))}
                </select>
              </label>
            )}
            {showEndpoint && (
              <label>
                Endpoint
                <input
                  value={config.baseUrl ?? providerMeta.defaultBaseUrl ?? ""}
                  onChange={(e) => {
                    setConfig({ ...config, baseUrl: e.target.value });
                    if (isRealtimeVoiceProvider(config.provider) && isActiveRealtimeVoiceConfig(realtimeVoiceConfig)) {
                      setRealtimeVoiceConfig({ ...realtimeVoiceConfig, websocketUrl: e.target.value });
                    }
                  }}
                />
              </label>
            )}
            {showCredential && (
              <label>
                {config.provider === "openclaw"
                  ? OPENCLAW_GATEWAY_TOKEN_LABEL
                  : config.provider === "google-live"
                    ? "Google Live credential"
                    : config.provider === "openai-realtime"
                      ? "OpenAI Realtime credential"
                      : "Credential"}
                <input
                  aria-label={config.provider === "openclaw" ? OPENCLAW_GATEWAY_TOKEN_LABEL : undefined}
                  type="password"
                  value={config.credential ?? ""}
                  onChange={(e) => {
                    setConfig({ ...config, credential: e.target.value });
                    if (isRealtimeVoiceProvider(config.provider) && isActiveRealtimeVoiceConfig(realtimeVoiceConfig)) {
                      setRealtimeVoiceConfig({ ...realtimeVoiceConfig, credential: e.target.value });
                    }
                  }}
                  placeholder={
                    config.provider === "openclaw"
                      ? OPENCLAW_GATEWAY_TOKEN_PLACEHOLDER
                      : "Stays local in your browser - we don't see or store this"
                  }
                />
                {config.provider === "openclaw" && <span className="field-help">{OPENCLAW_GATEWAY_TOKEN_HELP}</span>}
              </label>
            )}
            {isClaudeCli && (
              <div className="provider-note" role="note">
                Claude CLI reuses your local Claude CLI login. Run claude auth login in a terminal if Claude is not already authenticated.
              </div>
            )}
            {localAuthProvider && localAuthCopy && (
              <div className="provider-note" role="status">
                <div>{localAuthStatus?.authenticated ? localAuthCopy.signedIn : localAuthCopy.idle}</div>
                {localAuthStatus?.accountLabel && <div>{localAuthStatus.accountLabel}</div>}
                {localAuthStatus?.message && <div>{localAuthStatus.message}</div>}
                {"verificationUrl" in (localAuthStatus ?? {}) && typeof localAuthStatus?.verificationUrl === "string" && (
                  <a href={localAuthStatus.verificationUrl} target="_blank" rel="noreferrer">
                    Open sign-in page
                  </a>
                )}
                {localAuthError && <div>{localAuthError}</div>}
                <div className="onboarding-actions">
                  <button type="button" className="onboarding-secondary" disabled={localAuthBusy} onClick={() => requestLocalAuth("status")}>
                    {localAuthBusy ? localAuthCopy.checking : "Check sign-in"}
                  </button>
                  {localAuthProvider !== "claude-cli" && (
                    <button type="button" className="onboarding-primary" disabled={localAuthBusy} onClick={() => requestLocalAuth("login")}>
                      {localAuthBusy ? localAuthCopy.checking : localAuthCopy.login}
                    </button>
                  )}
                </div>
              </div>
            )}
            {config.provider === "openclaw" && <OpenClawSetupHint />}
          </fieldset>
          <div className="onboarding-footer">
            <button
              type="button"
              className="onboarding-back"
              onClick={() =>
                mode === "configure" || SKIP_WELCOME_SCREEN ? onClose() : setStep("welcome")
              }
            >
              {mode === "configure" || SKIP_WELCOME_SCREEN ? "Cancel" : "Back"}
            </button>
            <button
              type="button"
              className="onboarding-primary"
              onClick={() => {
                if (isRealtimeVoiceProvider(config.provider)) {
                  handleCustomStart();
                  return;
                }
                setStep("tts");
              }}
            >
              {isRealtimeVoiceProvider(config.provider) ? (mode === "configure" ? "Save" : "Start Liteforms") : "Next"}
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
                {ttsProviderOptions.map((p) => (
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
                  onChange={(e) => {
                    setTtsConfig({ ...ttsConfig, credential: e.target.value } as TtsConfig);
                  }}
                  placeholder="Stays local in your browser - we don't see or store this"
                />
              </label>
            )}
          </fieldset>
          <div className="onboarding-footer">
            <button type="button" className="onboarding-back" onClick={() => setStep("llm")}>
              Back
            </button>
            <button
              type="button"
              className="onboarding-primary"
              onClick={() => setStep("stt")}
            >
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
              {sttProviderOptions.map((p) => (
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
                placeholder="Stays local in your browser - we don't see or store this"
              />
            </label>
          )}
        </fieldset>
        <div className="onboarding-footer">
          <button type="button" className="onboarding-back" onClick={() => setStep("tts")}>
            Back
          </button>
          <button type="button" className="onboarding-primary" onClick={handleCustomStart}>
            {mode === "configure" ? "Save" : "Start Liteforms"}
          </button>
        </div>
      </div>
    </div>
  );
}
