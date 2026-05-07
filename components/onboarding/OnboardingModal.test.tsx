// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OnboardingModal } from "./OnboardingModal";
import type { LocalModelLoadState } from "@/components/chat/ChatPanel";
import { OPENCLAW_ENABLE_CHAT_COMPLETIONS_COMMAND } from "@/lib/llm/openclawSetup";

afterEach(cleanup);

const readyLoadState: LocalModelLoadState[] = [
  { id: "gemma", label: "Gemma 4 E2B q8", status: "ready", progress: 100, message: "Ready" },
  { id: "kokoro", label: "Kokoro", status: "ready", progress: 100, message: "Ready" },
  { id: "distil-whisper", label: "Distil-Whisper", status: "ready", progress: 100, message: "Ready" }
];

const loadingLoadState: LocalModelLoadState[] = [
  { id: "gemma", label: "Gemma 4 E2B q8", status: "loading", progress: 50, message: "Downloading" },
  { id: "kokoro", label: "Kokoro", status: "idle", progress: 0, message: "Waiting" },
  { id: "distil-whisper", label: "Distil-Whisper", status: "idle", progress: 0, message: "Waiting" }
];

function renderModal(overrides: {
  onUseBuiltIn?: () => void;
  onUseCustom?: (...args: unknown[]) => void;
  onClose?: () => void;
  localModelLoadState?: LocalModelLoadState[];
} = {}) {
  const onUseBuiltIn = overrides.onUseBuiltIn ?? vi.fn();
  const onUseCustom = overrides.onUseCustom ?? vi.fn();
  const onClose = overrides.onClose ?? vi.fn();
  const localModelLoadState = overrides.localModelLoadState;
  render(
    <OnboardingModal
      onUseBuiltIn={onUseBuiltIn}
      onUseCustom={onUseCustom}
      onClose={onClose}
      localModelLoadState={localModelLoadState}
    />
  );
  return { onUseBuiltIn, onUseCustom, onClose };
}

// ── Navigation helpers ────────────────────────────────────────────────────────
// SKIP_WELCOME_SCREEN=true: the modal opens directly on the LLM step.
// goToLlmStep is intentionally a no-op — it exists so callers don't change.

function goToLlmStep() {
  // Modal starts on the LLM step; no navigation needed.
}
function goToTtsStep() {
  goToLlmStep();
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
}
function goToSttStep() {
  goToTtsStep();
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
}
// Navigate to the loading step via the custom-config flow (LLM → TTS → STT → Start).
function goToLoadingStep() {
  goToSttStep();
  fireEvent.click(screen.getByRole("button", { name: /start liteforms/i }));
}

// ── Welcome screen ────────────────────────────────────────────────────────────
// SKIP_WELCOME_SCREEN=true: the welcome step is preserved in the source but never
// shown. These tests document its expected behaviour and can be re-enabled by
// setting SKIP_WELCOME_SCREEN=false in OnboardingModal.tsx.

describe.skip("OnboardingModal welcome screen", () => {
  it("renders the intro text mentioning built-in free models", () => {
    renderModal();
    expect(screen.getByText(/built-in free models/i)).toBeInTheDocument();
  });

  it("mentions supported providers in the intro text", () => {
    renderModal();
    expect(screen.getByText(/openClaw.*chatgpt.*anthropic/i)).toBeInTheDocument();
  });

  it("renders a built-in models button", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /built-in models/i })).toBeInTheDocument();
  });

  it("renders a custom configuration button", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /custom configuration/i })).toBeInTheDocument();
  });

  it("calls onUseBuiltIn when the built-in models button is clicked", () => {
    const onUseBuiltIn = vi.fn();
    renderModal({ onUseBuiltIn });
    goToLoadingStep();
    expect(onUseBuiltIn).toHaveBeenCalledOnce();
  });

  it("shows loading step when built-in models button is clicked", () => {
    renderModal();
    goToLoadingStep();
    expect(screen.getByText(/Downloading models/i)).toBeInTheDocument();
    expect(screen.queryByText(/built-in free models/i)).not.toBeInTheDocument();
  });

  it("does not call onUseCustom when built-in models is clicked", () => {
    const onUseCustom = vi.fn();
    renderModal({ onUseCustom });
    goToLoadingStep();
    expect(onUseCustom).not.toHaveBeenCalled();
  });

  it("shows LLM step when custom configuration button is clicked", () => {
    renderModal();
    goToLlmStep();
    expect(screen.getByRole("heading", { name: /select llm/i })).toBeInTheDocument();
    expect(screen.queryByText(/built-in free models/i)).not.toBeInTheDocument();
  });
});

// ── Loading step ──────────────────────────────────────────────────────────────

describe("OnboardingModal loading step", () => {
  it("shows the currently-loading model name in the loading step", () => {
    renderModal({ localModelLoadState: loadingLoadState });
    goToLoadingStep();
    // Only the active model (first one with status "loading") is shown as the current label
    expect(screen.getByText("Gemma 4 E2B q8")).toBeInTheDocument();
  });

  it("shows the next-queued model name when nothing is loading yet", () => {
    const idleState = loadingLoadState.map((m) => ({ ...m, status: "idle" as const, progress: 0 }));
    renderModal({ localModelLoadState: idleState });
    goToLoadingStep();
    // First idle model becomes the active label
    expect(screen.getByText("Gemma 4 E2B q8")).toBeInTheDocument();
  });

  it("shows 'All models ready' when all models are done", () => {
    renderModal({ localModelLoadState: readyLoadState });
    goToLoadingStep();
    expect(screen.getByText(/all models ready/i)).toBeInTheDocument();
  });

  it("shows overall local-model progress in the disabled button while loading", () => {
    renderModal({ localModelLoadState: loadingLoadState });
    goToLoadingStep();
    // loadingLoadState has one model at 50% and two at 0%.
    expect(screen.getByRole("button", { name: "16.7%" })).toBeDisabled();
  });

  // ── Queue list ──────────────────────────────────────────────────────────────

  it("shows all model names in the queue list", () => {
    renderModal({ localModelLoadState: loadingLoadState });
    goToLoadingStep();
    expect(screen.getByText("Gemma 4 E2B q8")).toBeInTheDocument();
    expect(screen.getByText("Kokoro")).toBeInTheDocument();
    expect(screen.getByText("Distil-Whisper")).toBeInTheDocument();
  });

  it("marks the active (loading) model with --loading class", () => {
    renderModal({ localModelLoadState: loadingLoadState });
    goToLoadingStep();
    // loadingLoadState: gemma is loading, kokoro and distil-whisper are idle
    const gemmaItem = screen.getByText("Gemma 4 E2B q8").closest(".onboarding-queue-item");
    expect(gemmaItem).toHaveClass("onboarding-queue-item--loading");
  });

  it("marks queued (idle) models with --idle class", () => {
    renderModal({ localModelLoadState: loadingLoadState });
    goToLoadingStep();
    const kokoroItem = screen.getByText("Kokoro").closest(".onboarding-queue-item");
    expect(kokoroItem).toHaveClass("onboarding-queue-item--idle");
    const whisperItem = screen.getByText("Distil-Whisper").closest(".onboarding-queue-item");
    expect(whisperItem).toHaveClass("onboarding-queue-item--idle");
  });

  it("marks finished models with --ready class", () => {
    renderModal({ localModelLoadState: readyLoadState });
    goToLoadingStep();
    const gemmaItem = screen.getByText("Gemma 4 E2B q8").closest(".onboarding-queue-item");
    expect(gemmaItem).toHaveClass("onboarding-queue-item--ready");
  });

  it("formats fractional progress with one decimal place in the button", () => {
    const fractionalState = loadingLoadState.map((m, i) =>
      i === 0 ? { ...m, status: "loading" as const, progress: 13.6789 } : m
    );
    renderModal({ localModelLoadState: fractionalState });
    goToLoadingStep();
    expect(screen.getByRole("button", { name: "4.6%" })).toBeDisabled();
  });

  it("shows a Continue button on the loading step", () => {
    renderModal({ localModelLoadState: readyLoadState });
    goToLoadingStep();
    expect(screen.getByRole("button", { name: /continue/i })).toBeInTheDocument();
  });

  it("calls onClose when Continue is clicked", () => {
    const onClose = vi.fn();
    renderModal({ localModelLoadState: readyLoadState, onClose });
    goToLoadingStep();
    fireEvent.click(screen.getByRole("button", { name: /continue/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Continue button is disabled while models are still loading", () => {
    renderModal({ localModelLoadState: loadingLoadState });
    goToLoadingStep();
    // While loading, the button shows overall progress % and is disabled
    expect(screen.getByRole("button", { name: /\d+%/ })).toBeDisabled();
  });

  it("Continue button is enabled when all models are ready", () => {
    renderModal({ localModelLoadState: readyLoadState });
    goToLoadingStep();
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
  });
});

// ── Initial render (welcome skipped) ─────────────────────────────────────────

describe("OnboardingModal initial render (SKIP_WELCOME_SCREEN=true)", () => {
  it("opens directly on the LLM step — shows the LLM heading", () => {
    renderModal();
    expect(screen.getByRole("heading", { name: /select llm/i })).toBeInTheDocument();
  });

  it("does not show the welcome screen intro text on initial render", () => {
    renderModal();
    expect(screen.queryByText(/built-in free models/i)).not.toBeInTheDocument();
  });

  it("does not show a 'built-in models' button on initial render", () => {
    renderModal();
    expect(screen.queryByRole("button", { name: /built-in models/i })).not.toBeInTheDocument();
  });
});

// ── LLM step ──────────────────────────────────────────────────────────────────

describe("OnboardingModal LLM step", () => {
  it("shows a heading for LLM selection", () => {
    renderModal();
    goToLlmStep();
    expect(screen.getByRole("heading", { name: /select llm/i })).toBeInTheDocument();
  });

  it("shows description text mentioning the brain", () => {
    renderModal();
    goToLlmStep();
    expect(screen.getByText(/brain/i)).toBeInTheDocument();
  });

  it("shows the LLM provider dropdown", () => {
    renderModal();
    goToLlmStep();
    expect(screen.getByRole("combobox", { name: /model provider/i })).toBeInTheDocument();
  });

  it("defaults to Anthropic API (anthropic)", () => {
    renderModal();
    goToLlmStep();
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("anthropic");
  });

  it("hides model dropdown for browser-local-gemma (only one model)", () => {
    renderModal();
    goToLlmStep();
    // Explicitly select browser-local-gemma
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "browser-local-gemma" }
    });
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows model dropdown again after switching to a multi-model provider", () => {
    renderModal();
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "anthropic" }
    });
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("has a Cancel button that closes the modal (welcome screen is skipped)", () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    goToLlmStep();
    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("has a Next button that advances to the TTS step", () => {
    renderModal();
    goToLlmStep();
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: /text-to-speech/i })).toBeInTheDocument();
  });

  it("offers Google Live as an end-to-end model provider", () => {
    renderModal();
    goToLlmStep();
    expect(screen.getByRole("option", { name: /google live \(includes tts and stt\)/i })).toBeInTheDocument();
  });

  it("shows Live-specific model and voice choices for Google Live", () => {
    renderModal();
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "google-live" }
    });

    expect(screen.getByRole("option", { name: /^gemini 2\.5 flash native audio$/i })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: /gemini live 2\.5 flash preview/i })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Voice" })).toHaveValue("Kore");
    expect(screen.getByRole("option", { name: /aoede - breezy/i })).toBeInTheDocument();
  });

  it("skips TTS and STT when Google Live is selected on the model step", () => {
    const onUseCustom = vi.fn();
    renderModal({ onUseCustom });
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "google-live" }
    });
    fireEvent.change(screen.getByRole("combobox", { name: "Voice" }), { target: { value: "Aoede" } });
    fireEvent.change(screen.getByLabelText("Google Live credential"), { target: { value: "google-key" } });
    fireEvent.click(screen.getByRole("button", { name: /start liteforms/i }));

    expect(screen.queryByRole("heading", { name: /text-to-speech/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: /speech-to-text/i })).not.toBeInTheDocument();
    expect(onUseCustom).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "google-live", credential: "google-key" }),
      expect.objectContaining({ provider: "kokoro" }),
      expect.objectContaining({ provider: "distil-whisper" }),
      expect.objectContaining({ provider: "google-live", credential: "google-key", voice: "Aoede" })
    );
  });

  it("shows endpoint field when a non-local provider is selected", () => {
    renderModal();
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "openai" }
    });
    expect(screen.getByRole("textbox", { name: /endpoint/i })).toBeInTheDocument();
  });

  it("shows the OpenClaw setup command when OpenClaw is selected", () => {
    renderModal();
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "openclaw" }
    });

    expect(screen.getByText(OPENCLAW_ENABLE_CHAT_COMPLETIONS_COMMAND)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy openclaw setup command/i })).toBeInTheDocument();
  });

  it("defaults OpenClaw onboarding fields to the local gateway model and endpoint", () => {
    renderModal();
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "openclaw" }
    });

    expect(screen.getByRole("textbox", { name: "Model" })).toHaveValue("openclaw/default");
    expect(screen.getByRole("textbox", { name: /endpoint/i })).toHaveValue("http://127.0.0.1:18789/v1");
  });

  it("labels the OpenClaw credential as the gateway token", () => {
    renderModal();
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "openclaw" }
    });

    expect(screen.getByLabelText("OpenClaw Gateway token")).toBeInTheDocument();
    expect(screen.getByText(/required when OpenClaw Gateway auth is enabled/i)).toBeInTheDocument();
  });

  it("does not show a Liteforms persona injection option for OpenClaw", () => {
    renderModal();
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "openclaw" }
    });

    expect(screen.queryByLabelText(/inject liteforms persona/i)).not.toBeInTheDocument();
  });

  it("hides endpoint field for browser-local-gemma", () => {
    renderModal();
    goToLlmStep();
    // Explicitly select browser-local-gemma (default is now anthropic which shows endpoint)
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "browser-local-gemma" }
    });
    expect(screen.queryByRole("textbox", { name: /endpoint/i })).not.toBeInTheDocument();
  });
});

// ── TTS step ──────────────────────────────────────────────────────────────────

describe("OnboardingModal TTS step", () => {
  it("shows a heading for TTS selection", () => {
    renderModal();
    goToTtsStep();
    expect(screen.getByRole("heading", { name: /text-to-speech/i })).toBeInTheDocument();
  });

  it("shows description text mentioning the voice", () => {
    renderModal();
    goToTtsStep();
    // The heading specifically names "the voice"
    expect(screen.getByRole("heading", { name: /the voice/i })).toBeInTheDocument();
  });

  it("shows the TTS voice provider dropdown", () => {
    renderModal();
    goToTtsStep();
    expect(screen.getByRole("combobox", { name: /voice/i })).toBeInTheDocument();
  });

  it("defaults to kokoro", () => {
    renderModal();
    goToTtsStep();
    expect(screen.getByRole("combobox", { name: /voice/i })).toHaveValue("kokoro");
  });

  it("has a Back button that returns to the LLM step", () => {
    renderModal();
    goToTtsStep();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByRole("heading", { name: /select llm/i })).toBeInTheDocument();
  });

  it("has a Next button that advances to the STT step", () => {
    renderModal();
    goToTtsStep();
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: /speech-to-text/i })).toBeInTheDocument();
  });

});

// ── STT step ──────────────────────────────────────────────────────────────────

describe("OnboardingModal STT step", () => {
  it("shows a heading for STT selection", () => {
    renderModal();
    goToSttStep();
    expect(screen.getByRole("heading", { name: /speech-to-text/i })).toBeInTheDocument();
  });

  it("shows description text mentioning the ears", () => {
    renderModal();
    goToSttStep();
    expect(screen.getByText(/ears/i)).toBeInTheDocument();
  });

  it("shows the STT speech input dropdown", () => {
    renderModal();
    goToSttStep();
    expect(screen.getByRole("combobox", { name: /speech input/i })).toBeInTheDocument();
  });

  it("defaults to distil-whisper", () => {
    renderModal();
    goToSttStep();
    expect(screen.getByRole("combobox", { name: /speech input/i })).toHaveValue("distil-whisper");
  });

  it("has a Back button that returns to the TTS step", () => {
    renderModal();
    goToSttStep();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByRole("heading", { name: /text-to-speech/i })).toBeInTheDocument();
  });

  it("calls onUseCustom with default configs when Start Liteforms is clicked", () => {
    const onUseCustom = vi.fn();
    renderModal({ onUseCustom });
    goToSttStep();
    fireEvent.click(screen.getByRole("button", { name: /start liteforms/i }));
    expect(onUseCustom).toHaveBeenCalledOnce();
    expect(onUseCustom).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic" }),
      expect.objectContaining({ provider: "kokoro" }),
      expect.objectContaining({ provider: "distil-whisper" })
    );
  });

  it("calls onUseCustom with the LLM provider chosen on the LLM step", () => {
    const onUseCustom = vi.fn();
    renderModal({ onUseCustom });
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "openai" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i })); // → TTS
    fireEvent.click(screen.getByRole("button", { name: /^next$/i })); // → STT
    fireEvent.click(screen.getByRole("button", { name: /start liteforms/i }));
    expect(onUseCustom).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai" }),
      expect.anything(),
      expect.anything()
    );
  });

  it("calls onUseCustom with the TTS provider chosen on the TTS step", () => {
    const onUseCustom = vi.fn();
    renderModal({ onUseCustom });
    goToTtsStep();
    fireEvent.change(screen.getByRole("combobox", { name: /voice/i }), {
      target: { value: "elevenlabs" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i })); // → STT
    fireEvent.click(screen.getByRole("button", { name: /start liteforms/i }));
    expect(onUseCustom).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ provider: "elevenlabs" }),
      expect.anything()
    );
  });

  it("calls onUseCustom with the STT provider chosen on the STT step", () => {
    const onUseCustom = vi.fn();
    renderModal({ onUseCustom });
    goToSttStep();
    fireEvent.change(screen.getByRole("combobox", { name: /speech input/i }), {
      target: { value: "deepgram" }
    });
    fireEvent.click(screen.getByRole("button", { name: /start liteforms/i }));
    expect(onUseCustom).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({ provider: "deepgram" })
    );
  });
});

// ── LLM model dropdown ────────────────────────────────────────────────────────

describe("OnboardingModal LLM model selection", () => {
  function goToLlmAndSelectProvider(providerId: string) {
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: providerId }
    });
  }

  // ── Dropdown vs text input ────────────────────────────────────────────────

  it("shows a model dropdown for Anthropic (provider with known models)", () => {
    renderModal();
    goToLlmAndSelectProvider("anthropic");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows a model dropdown for OpenAI (provider with known models)", () => {
    renderModal();
    goToLlmAndSelectProvider("openai");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows a model dropdown for ChatGPT connector (provider with known models)", () => {
    renderModal();
    goToLlmAndSelectProvider("chatgpt-subscription");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("shows a model dropdown for Claude connector (provider with known models)", () => {
    renderModal();
    goToLlmAndSelectProvider("claude-subscription");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("shows a free-text model input for Ollama (dynamic local models)", () => {
    renderModal();
    goToLlmAndSelectProvider("ollama");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows a free-text model input for OpenRouter (dynamic gateway)", () => {
    renderModal();
    goToLlmAndSelectProvider("openrouter");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows a free-text model input for LM Studio (dynamic local models)", () => {
    renderModal();
    goToLlmAndSelectProvider("lmstudio");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
  });

  // ── Anthropic models ──────────────────────────────────────────────────────

  it("Anthropic model dropdown includes claude-opus-4-7", () => {
    renderModal();
    goToLlmAndSelectProvider("anthropic");
    expect(screen.getByRole("option", { name: /claude opus 4\.7/i })).toBeInTheDocument();
  });

  it("Anthropic model dropdown includes claude-opus-4-5", () => {
    renderModal();
    goToLlmAndSelectProvider("anthropic");
    expect(screen.getByRole("option", { name: /claude opus 4\.5/i })).toBeInTheDocument();
  });

  it("Anthropic model dropdown includes claude-sonnet-4-6", () => {
    renderModal();
    goToLlmAndSelectProvider("anthropic");
    expect(screen.getByRole("option", { name: /claude sonnet 4\.6/i })).toBeInTheDocument();
  });

  it("Anthropic model dropdown includes claude-sonnet-4-5", () => {
    renderModal();
    goToLlmAndSelectProvider("anthropic");
    expect(screen.getByRole("option", { name: /claude sonnet 4\.5/i })).toBeInTheDocument();
  });

  it("Anthropic model dropdown includes claude-haiku-4-5", () => {
    renderModal();
    goToLlmAndSelectProvider("anthropic");
    expect(screen.getByRole("option", { name: /claude haiku 4\.5/i })).toBeInTheDocument();
  });

  it("Anthropic model dropdown includes claude-haiku-3-5", () => {
    renderModal();
    goToLlmAndSelectProvider("anthropic");
    expect(screen.getByRole("option", { name: /claude haiku 3\.5/i })).toBeInTheDocument();
  });

  it("Anthropic defaults to claude-opus-4-7", () => {
    renderModal();
    goToLlmAndSelectProvider("anthropic");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("claude-opus-4-7");
  });

  // ── OpenAI models ─────────────────────────────────────────────────────────

  it("OpenAI model dropdown includes gpt-5.5", () => {
    renderModal();
    goToLlmAndSelectProvider("openai");
    expect(screen.getByRole("option", { name: /gpt-5\.5$/i })).toBeInTheDocument();
  });

  it("OpenAI model dropdown includes gpt-5.5-pro", () => {
    renderModal();
    goToLlmAndSelectProvider("openai");
    expect(screen.getByRole("option", { name: /gpt-5\.5 pro/i })).toBeInTheDocument();
  });

  it("OpenAI model dropdown includes gpt-5.4", () => {
    renderModal();
    goToLlmAndSelectProvider("openai");
    expect(screen.getByRole("option", { name: /gpt-5\.4$/i })).toBeInTheDocument();
  });

  it("OpenAI model dropdown includes gpt-5.4-mini", () => {
    renderModal();
    goToLlmAndSelectProvider("openai");
    expect(screen.getByRole("option", { name: /gpt-5\.4 mini/i })).toBeInTheDocument();
  });

  it("OpenAI model dropdown includes gpt-5.4-nano", () => {
    renderModal();
    goToLlmAndSelectProvider("openai");
    expect(screen.getByRole("option", { name: /gpt-5\.4 nano/i })).toBeInTheDocument();
  });

  it("OpenAI defaults to gpt-5.5", () => {
    renderModal();
    goToLlmAndSelectProvider("openai");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("gpt-5.5");
  });

  // ── ChatGPT connector models ──────────────────────────────────────────────

  it("ChatGPT connector model dropdown includes gpt-5.5", () => {
    renderModal();
    goToLlmAndSelectProvider("chatgpt-subscription");
    expect(screen.getByRole("option", { name: /gpt-5\.5$/i })).toBeInTheDocument();
  });

  it("ChatGPT connector model dropdown includes gpt-5.5-pro", () => {
    renderModal();
    goToLlmAndSelectProvider("chatgpt-subscription");
    expect(screen.getByRole("option", { name: /gpt-5\.5 pro/i })).toBeInTheDocument();
  });

  it("ChatGPT connector model dropdown includes gpt-5.4", () => {
    renderModal();
    goToLlmAndSelectProvider("chatgpt-subscription");
    expect(screen.getByRole("option", { name: /gpt-5\.4$/i })).toBeInTheDocument();
  });

  it("ChatGPT connector model dropdown includes gpt-5.4-pro", () => {
    renderModal();
    goToLlmAndSelectProvider("chatgpt-subscription");
    expect(screen.getByRole("option", { name: /gpt-5\.4 pro/i })).toBeInTheDocument();
  });

  it("ChatGPT connector defaults to gpt-5.5", () => {
    renderModal();
    goToLlmAndSelectProvider("chatgpt-subscription");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("gpt-5.5");
  });

  // ── Claude connector models ───────────────────────────────────────────────

  it("Claude connector model dropdown includes claude-opus-4-7", () => {
    renderModal();
    goToLlmAndSelectProvider("claude-subscription");
    expect(screen.getByRole("option", { name: /claude opus 4\.7/i })).toBeInTheDocument();
  });

  it("Claude connector model dropdown includes claude-sonnet-4-5", () => {
    renderModal();
    goToLlmAndSelectProvider("claude-subscription");
    expect(screen.getByRole("option", { name: /claude sonnet 4\.5/i })).toBeInTheDocument();
  });

  it("Claude connector model dropdown includes claude-haiku-4-5", () => {
    renderModal();
    goToLlmAndSelectProvider("claude-subscription");
    expect(screen.getByRole("option", { name: /claude haiku 4\.5/i })).toBeInTheDocument();
  });

  // ── Config integration ────────────────────────────────────────────────────

  it("changing the Anthropic model dropdown updates the submitted config", () => {
    const onUseCustom = vi.fn();
    renderModal({ onUseCustom });
    goToLlmAndSelectProvider("anthropic");
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), {
      target: { value: "claude-sonnet-4-5" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /start liteforms/i }));
    expect(onUseCustom).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "anthropic", model: "claude-sonnet-4-5" }),
      expect.anything(),
      expect.anything()
    );
  });

  it("changing the OpenAI model dropdown updates the submitted config", () => {
    const onUseCustom = vi.fn();
    renderModal({ onUseCustom });
    goToLlmAndSelectProvider("openai");
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), {
      target: { value: "gpt-5.4-mini" }
    });
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    fireEvent.click(screen.getByRole("button", { name: /start liteforms/i }));
    expect(onUseCustom).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", model: "gpt-5.4-mini" }),
      expect.anything(),
      expect.anything()
    );
  });
});

// ── ElevenLabs credential sharing ─────────────────────────────────────────────

describe("OnboardingModal ElevenLabs credential sharing", () => {
  it("pre-populates ElevenLabs STT credential when TTS ElevenLabs credential is already set", () => {
    renderModal();
    // Set TTS to ElevenLabs and enter a credential
    goToTtsStep();
    fireEvent.change(screen.getByRole("combobox", { name: /voice/i }), {
      target: { value: "elevenlabs" }
    });
    fireEvent.change(screen.getByLabelText(/voice credential/i), {
      target: { value: "my-eleven-key" }
    });
    // Move to STT step
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    // Switch STT to ElevenLabs
    fireEvent.change(screen.getByRole("combobox", { name: /speech input/i }), {
      target: { value: "elevenlabs" }
    });
    // The transcription credential should be pre-populated
    expect(screen.getByLabelText(/transcription credential/i)).toHaveValue("my-eleven-key");
  });

  it("does not pre-populate STT credential when TTS is not ElevenLabs", () => {
    renderModal();
    goToSttStep();
    fireEvent.change(screen.getByRole("combobox", { name: /speech input/i }), {
      target: { value: "elevenlabs" }
    });
    expect(screen.getByLabelText(/transcription credential/i)).toHaveValue("");
  });
});

// ── New cloud providers ────────────────────────────────────────────────────────

describe("OnboardingModal new cloud provider options", () => {
  function goToLlmAndSelectProvider(providerId: string) {
    // Modal starts on LLM step (SKIP_WELCOME_SCREEN=true); just select the provider.
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: providerId }
    });
  }

  // ── Provider options exist ────────────────────────────────────────────────

  it("Google AI Studio appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("google");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("google");
  });

  it("xAI (Grok) appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("xai");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("xai");
  });

  it("Mistral AI appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("mistral");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("mistral");
  });

  it("Cerebras appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("cerebras");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("cerebras");
  });

  it("NVIDIA appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("nvidia");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("nvidia");
  });

  it("Groq appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("groq");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("groq");
  });

  it("Together AI appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("together");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("together");
  });

  it("Fireworks appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("fireworks");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("fireworks");
  });

  it("Qwen Cloud appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("qwen");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("qwen");
  });

  // ── Model dropdowns for providers with static catalogs ────────────────────

  it("Google shows a model dropdown", () => {
    renderModal();
    goToLlmAndSelectProvider("google");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("xAI shows a model dropdown", () => {
    renderModal();
    goToLlmAndSelectProvider("xai");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("Mistral shows a model dropdown", () => {
    renderModal();
    goToLlmAndSelectProvider("mistral");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("Cerebras shows a model dropdown", () => {
    renderModal();
    goToLlmAndSelectProvider("cerebras");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("NVIDIA shows a model dropdown", () => {
    renderModal();
    goToLlmAndSelectProvider("nvidia");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  it("Groq shows a free-text model input (dynamic models)", () => {
    renderModal();
    goToLlmAndSelectProvider("groq");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("Together AI shows a free-text model input", () => {
    renderModal();
    goToLlmAndSelectProvider("together");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
  });

  it("Fireworks shows a free-text model input", () => {
    renderModal();
    goToLlmAndSelectProvider("fireworks");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
  });

  it("Qwen Cloud shows a free-text model input", () => {
    renderModal();
    goToLlmAndSelectProvider("qwen");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
  });

  // ── Default models ────────────────────────────────────────────────────────

  it("Google defaults to gemini-3.1-pro-preview", () => {
    renderModal();
    goToLlmAndSelectProvider("google");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("gemini-3.1-pro-preview");
  });

  it("xAI defaults to grok-4", () => {
    renderModal();
    goToLlmAndSelectProvider("xai");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("grok-4");
  });

  it("Mistral defaults to mistral-large-latest", () => {
    renderModal();
    goToLlmAndSelectProvider("mistral");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("mistral-large-latest");
  });

  it("Cerebras defaults to gpt-oss-120b", () => {
    renderModal();
    goToLlmAndSelectProvider("cerebras");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("gpt-oss-120b");
  });

  it("NVIDIA defaults to nvidia/nemotron-3-super-120b-a12b", () => {
    renderModal();
    goToLlmAndSelectProvider("nvidia");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("nvidia/nemotron-3-super-120b-a12b");
  });

  // ── Key models in static catalogs ─────────────────────────────────────────

  it("Google model dropdown includes gemini-2.5-pro", () => {
    renderModal();
    goToLlmAndSelectProvider("google");
    expect(screen.getByRole("option", { name: /gemini 2\.5 pro/i })).toBeInTheDocument();
  });

  it("Google model dropdown includes gemini-3-flash-preview", () => {
    renderModal();
    goToLlmAndSelectProvider("google");
    expect(screen.getByRole("option", { name: /gemini 3 flash/i })).toBeInTheDocument();
  });

  it("xAI model dropdown includes grok-4-fast", () => {
    renderModal();
    goToLlmAndSelectProvider("xai");
    expect(screen.getByRole("option", { name: /grok 4 fast$/i })).toBeInTheDocument();
  });

  it("xAI model dropdown includes grok-3", () => {
    renderModal();
    goToLlmAndSelectProvider("xai");
    expect(screen.getByRole("option", { name: /^grok 3$/i })).toBeInTheDocument();
  });

  it("Mistral model dropdown includes mistral-small-latest", () => {
    renderModal();
    goToLlmAndSelectProvider("mistral");
    expect(screen.getByRole("option", { name: /mistral small/i })).toBeInTheDocument();
  });

  it("Mistral model dropdown includes codestral-latest", () => {
    renderModal();
    goToLlmAndSelectProvider("mistral");
    expect(screen.getByRole("option", { name: /codestral/i })).toBeInTheDocument();
  });

  it("Cerebras model dropdown includes llama3.1-8b", () => {
    renderModal();
    goToLlmAndSelectProvider("cerebras");
    expect(screen.getByRole("option", { name: /llama 3\.1 8b/i })).toBeInTheDocument();
  });

  it("NVIDIA model dropdown includes kimi-k2.5", () => {
    renderModal();
    goToLlmAndSelectProvider("nvidia");
    expect(screen.getByRole("option", { name: /kimi k2\.5/i })).toBeInTheDocument();
  });
});

// ── Additional TTS provider tests ─────────────────────────────────────────────

function selectTtsProvider(id: string) {
  fireEvent.change(screen.getByLabelText("Voice provider"), { target: { value: id } });
}

describe("OnboardingModal TTS step - extended providers", () => {
  beforeEach(() => {
    renderModal();
  });

  // ── All providers present ───────────────────────────────────────────────

  it("TTS dropdown includes OpenAI", () => {
    goToTtsStep();
    selectTtsProvider("openai");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("openai");
  });

  it("TTS dropdown includes Google", () => {
    goToTtsStep();
    selectTtsProvider("google");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("google");
  });

  it("TTS dropdown does not include Google Live", () => {
    goToTtsStep();
    expect(screen.queryByRole("option", { name: /google live/i })).not.toBeInTheDocument();
  });

  it("TTS dropdown includes xAI", () => {
    goToTtsStep();
    selectTtsProvider("xai");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("xai");
  });

  it("TTS dropdown includes DeepInfra", () => {
    goToTtsStep();
    selectTtsProvider("deepinfra");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("deepinfra");
  });

  it("TTS dropdown includes OpenRouter", () => {
    goToTtsStep();
    selectTtsProvider("openrouter");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("openrouter");
  });

  it("TTS dropdown includes Inworld", () => {
    goToTtsStep();
    selectTtsProvider("inworld");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("inworld");
  });

  it("TTS dropdown includes MiniMax", () => {
    goToTtsStep();
    selectTtsProvider("minimax");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("minimax");
  });

  it("TTS dropdown includes Gradium", () => {
    goToTtsStep();
    selectTtsProvider("gradium");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("gradium");
  });

  it("TTS dropdown includes Vydra", () => {
    goToTtsStep();
    selectTtsProvider("vydra");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("vydra");
  });

  it("TTS dropdown includes Xiaomi MiMo", () => {
    goToTtsStep();
    selectTtsProvider("xiaomi");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("xiaomi");
  });

  it("TTS dropdown includes Azure Speech", () => {
    goToTtsStep();
    selectTtsProvider("azure-speech");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("azure-speech");
  });

  it("TTS dropdown includes Microsoft Edge TTS", () => {
    goToTtsStep();
    selectTtsProvider("microsoft");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("microsoft");
  });

  it("TTS dropdown includes Volcengine", () => {
    goToTtsStep();
    selectTtsProvider("volcengine");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("volcengine");
  });

  // ── Static model/voice dropdowns ────────────────────────────────────────

  it("OpenAI TTS shows voice dropdown with coral as default", () => {
    goToTtsStep();
    selectTtsProvider("openai");
    const voiceSelect = screen.getByRole("combobox", { name: "Voice" });
    expect(voiceSelect).toHaveValue("coral");
    expect(screen.getByRole("option", { name: /alloy/i })).toBeInTheDocument();
  });

  it("OpenAI TTS shows model dropdown with gpt-4o-mini-tts as default", () => {
    goToTtsStep();
    selectTtsProvider("openai");
    const modelSelect = screen.getByRole("combobox", { name: "Model" });
    expect(modelSelect).toHaveValue("gpt-4o-mini-tts");
    expect(screen.getByRole("option", { name: /tts-1 hd/i })).toBeInTheDocument();
  });

  it("Google TTS shows voice dropdown with Kore as default", () => {
    goToTtsStep();
    selectTtsProvider("google");
    const voiceSelect = screen.getByRole("combobox", { name: "Voice" });
    expect(voiceSelect).toHaveValue("Kore");
    expect(screen.getByRole("option", { name: /zephyr/i })).toBeInTheDocument();
  });

  it("xAI TTS shows voice dropdown with eve as default", () => {
    goToTtsStep();
    selectTtsProvider("xai");
    expect(screen.getByRole("combobox", { name: "Voice" })).toHaveValue("eve");
  });

  it("MiniMax TTS shows voice dropdown with model dropdown", () => {
    goToTtsStep();
    selectTtsProvider("minimax");
    expect(screen.getByRole("combobox", { name: "Voice" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("speech-2.8-hd");
  });

  it("Gradium TTS shows voice dropdown with Emma as default", () => {
    goToTtsStep();
    selectTtsProvider("gradium");
    expect(screen.getByRole("combobox", { name: "Voice" })).toHaveValue("YTpq7expH9539ERJ");
    expect(screen.getByRole("option", { name: /emma/i })).toBeInTheDocument();
  });

  it("Volcengine TTS shows voice dropdown", () => {
    goToTtsStep();
    selectTtsProvider("volcengine");
    const voiceSelect = screen.getByRole("combobox", { name: "Voice" });
    expect(voiceSelect).toHaveValue("en_female_anna_mars_bigtts");
  });

  // ── Dynamic voice providers (text input) ───────────────────────────────

  it("Deepgram TTS shows voice text input (dynamic voices)", () => {
    goToTtsStep();
    selectTtsProvider("deepgram");
    expect(screen.getByRole("textbox", { name: "Voice" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Voice" })).not.toBeInTheDocument();
  });

  it("ElevenLabs TTS shows voice text input (dynamic voices from API)", () => {
    goToTtsStep();
    selectTtsProvider("elevenlabs");
    expect(screen.getByRole("textbox", { name: "Voice ID" })).toBeInTheDocument();
  });

  // ── Credential field ────────────────────────────────────────────────────

  it("all cloud TTS providers show a credential input", () => {
    const cloudIds = ["openai", "google", "xai", "deepinfra", "openrouter", "inworld",
      "minimax", "gradium", "vydra", "xiaomi", "azure-speech", "volcengine", "elevenlabs", "deepgram"];
    for (const id of cloudIds) {
      cleanup();
      renderModal();
      goToTtsStep();
      selectTtsProvider(id);
      expect(screen.getByLabelText("Voice credential"), `Expected credential for ${id}`).toBeInTheDocument();
    }
  });

  it("kokoro and microsoft do not show a credential input", () => {
    for (const id of ["kokoro", "microsoft"]) {
      cleanup();
      renderModal();
      goToTtsStep();
      selectTtsProvider(id);
      expect(screen.queryByLabelText("Voice credential"), `Expected no credential for ${id}`).not.toBeInTheDocument();
    }
  });
});

// ── Additional STT provider tests ─────────────────────────────────────────────

function selectSttProvider(id: string) {
  fireEvent.change(screen.getByLabelText("Speech input provider"), { target: { value: id } });
}

describe("OnboardingModal STT step - extended providers", () => {
  beforeEach(() => {
    renderModal();
  });

  it("STT dropdown includes OpenAI", () => {
    goToSttStep();
    selectSttProvider("openai");
    expect(screen.getByLabelText("Speech input provider")).toHaveValue("openai");
  });

  it("STT dropdown includes xAI", () => {
    goToSttStep();
    selectSttProvider("xai");
    expect(screen.getByLabelText("Speech input provider")).toHaveValue("xai");
  });

  it("STT dropdown includes Mistral", () => {
    goToSttStep();
    selectSttProvider("mistral");
    expect(screen.getByLabelText("Speech input provider")).toHaveValue("mistral");
  });

  it("OpenAI STT shows model dropdown with gpt-4o-transcribe as default", () => {
    goToSttStep();
    selectSttProvider("openai");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("gpt-4o-transcribe");
  });

  it("Mistral STT shows model dropdown with voxtral model as default", () => {
    goToSttStep();
    selectSttProvider("mistral");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("voxtral-mini-latest");
  });

  it("all new cloud STT providers show a credential input", () => {
    const cloudIds = ["openai", "xai", "mistral", "deepgram", "elevenlabs"];
    for (const id of cloudIds) {
      cleanup();
      renderModal();
      goToSttStep();
      selectSttProvider(id);
      expect(screen.getByLabelText("Transcription credential"), `Expected credential for ${id}`).toBeInTheDocument();
    }
  });

  it("distil-whisper does not show a credential input", () => {
    goToSttStep();
    selectSttProvider("distil-whisper");
    expect(screen.queryByLabelText("Transcription credential")).not.toBeInTheDocument();
  });

});

// ── Qwen 3.5 local model ───────────────────────────────────────────────────────

describe("OnboardingModal Qwen 3.5 local provider", () => {
  function goToLlmAndSelectProvider(providerId: string) {
    // Modal starts on LLM step (SKIP_WELCOME_SCREEN=true); just select the provider.
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: providerId }
    });
  }

  it("Qwen 3.5 0.8B (local) appears as a provider option", () => {
    renderModal();
    goToLlmAndSelectProvider("browser-local-qwen");
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("browser-local-qwen");
  });

  it("hides model dropdown for browser-local-qwen (only one model)", () => {
    renderModal();
    goToLlmAndSelectProvider("browser-local-qwen");
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("hides endpoint field for browser-local-qwen", () => {
    renderModal();
    goToLlmAndSelectProvider("browser-local-qwen");
    expect(screen.queryByRole("textbox", { name: /endpoint/i })).not.toBeInTheDocument();
  });

  it("Gemma 4 E2B (local) appears as a provider option at the bottom of the list", () => {
    renderModal();
    // Already on LLM step (SKIP_WELCOME_SCREEN=true)
    const select = screen.getByRole("combobox", { name: /model provider/i }) as HTMLSelectElement;
    const options = Array.from(select.options);
    expect(options[options.length - 1].value).toBe("browser-local-gemma");
  });

  it("Anthropic is the first option in the provider list", () => {
    renderModal();
    // Already on LLM step (SKIP_WELCOME_SCREEN=true)
    const select = screen.getByRole("combobox", { name: /model provider/i }) as HTMLSelectElement;
    expect(select.options[0].value).toBe("anthropic");
  });
});

// ── Loading screen filtering ───────────────────────────────────────────────────

describe("OnboardingModal loading screen — only shows selected models", () => {
  it("hides models marked as 'Not used' from the loading queue", () => {
    const filteredState: LocalModelLoadState[] = [
      { id: "gemma", label: "Gemma 4 E2B q8", status: "ready", progress: 100, message: "Not used" },
      { id: "kokoro", label: "Kokoro", status: "loading", progress: 50, message: "Downloading" },
      { id: "distil-whisper", label: "Distil-Whisper", status: "idle", progress: 0, message: "Waiting" }
    ];
    renderModal({ localModelLoadState: filteredState });
    goToLoadingStep();
    expect(screen.queryByText("Gemma 4 E2B q8")).not.toBeInTheDocument();
    expect(screen.getByText("Kokoro")).toBeInTheDocument();
    expect(screen.getByText("Distil-Whisper")).toBeInTheDocument();
  });

  it("shows 'All models ready' when all non-'Not used' models are ready", () => {
    const filteredState: LocalModelLoadState[] = [
      { id: "gemma", label: "Gemma 4 E2B q8", status: "ready", progress: 100, message: "Not used" },
      { id: "kokoro", label: "Kokoro", status: "ready", progress: 100, message: "Ready" },
      { id: "distil-whisper", label: "Distil-Whisper", status: "ready", progress: 100, message: "Ready" }
    ];
    renderModal({ localModelLoadState: filteredState });
    goToLoadingStep();
    expect(screen.getByText(/all models ready/i)).toBeInTheDocument();
  });
});
