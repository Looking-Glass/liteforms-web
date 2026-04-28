// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { OnboardingModal } from "./OnboardingModal";
import type { LocalModelLoadState } from "@/components/chat/ChatPanel";

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

function goToLlmStep() {
  fireEvent.click(screen.getByRole("button", { name: /custom configuration/i }));
}
function goToTtsStep() {
  goToLlmStep();
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
}
function goToSttStep() {
  goToTtsStep();
  fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
}
function goToLoadingStep() {
  fireEvent.click(screen.getByRole("button", { name: /built-in models/i }));
}

// ── Welcome screen ────────────────────────────────────────────────────────────

describe("OnboardingModal welcome screen", () => {
  it("renders the intro text mentioning built-in free configuration", () => {
    renderModal();
    expect(screen.getByText(/built-in free configuration/i)).toBeInTheDocument();
  });

  it("mentions supported providers in the intro text", () => {
    renderModal();
    expect(screen.getByText(/openClaw.*chatgpt.*anthropic/i)).toBeInTheDocument();
  });

  it("renders a built-in models button that mentions the download size", () => {
    renderModal();
    expect(screen.getByRole("button", { name: /built-in models.*300mb/i })).toBeInTheDocument();
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
    expect(screen.queryByText(/built-in free configuration/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Gemma/i)).toBeInTheDocument();
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
    expect(screen.queryByText(/built-in free configuration/i)).not.toBeInTheDocument();
  });
});

// ── Loading step ──────────────────────────────────────────────────────────────

describe("OnboardingModal loading step", () => {
  it("shows model names in the loading step", () => {
    renderModal({ localModelLoadState: loadingLoadState });
    goToLoadingStep();
    // Use exact label strings from the load state rows (not the description paragraph)
    expect(screen.getByText("Gemma 4 E2B q8")).toBeInTheDocument();
    expect(screen.getByText("Kokoro")).toBeInTheDocument();
    expect(screen.getByText("Distil-Whisper")).toBeInTheDocument();
  });

  it("shows the status message for each model", () => {
    renderModal({ localModelLoadState: loadingLoadState });
    goToLoadingStep();
    expect(screen.getByText("Downloading")).toBeInTheDocument();
    expect(screen.getAllByText("Waiting").length).toBeGreaterThanOrEqual(2);
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
    expect(screen.getByRole("button", { name: /continue/i })).toBeDisabled();
  });

  it("Continue button is enabled when all models are ready", () => {
    renderModal({ localModelLoadState: readyLoadState });
    goToLoadingStep();
    expect(screen.getByRole("button", { name: /continue/i })).not.toBeDisabled();
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

  it("defaults to Gemma in browser (browser-local-gemma)", () => {
    renderModal();
    goToLlmStep();
    expect(screen.getByRole("combobox", { name: /model provider/i })).toHaveValue("browser-local-gemma");
  });

  it("has a Back button that returns to the welcome screen", () => {
    renderModal();
    goToLlmStep();
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));
    expect(screen.getByText(/built-in free configuration/i)).toBeInTheDocument();
  });

  it("has a Next button that advances to the TTS step", () => {
    renderModal();
    goToLlmStep();
    fireEvent.click(screen.getByRole("button", { name: /^next$/i }));
    expect(screen.getByRole("heading", { name: /text-to-speech/i })).toBeInTheDocument();
  });

  it("shows endpoint field when a non-local provider is selected", () => {
    renderModal();
    goToLlmStep();
    fireEvent.change(screen.getByRole("combobox", { name: /model provider/i }), {
      target: { value: "openai" }
    });
    expect(screen.getByRole("textbox", { name: /endpoint/i })).toBeInTheDocument();
  });

  it("hides endpoint field for browser-local-gemma", () => {
    renderModal();
    goToLlmStep();
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
      expect.objectContaining({ provider: "browser-local-gemma" }),
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
