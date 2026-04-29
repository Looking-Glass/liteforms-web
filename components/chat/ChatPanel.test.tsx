// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ChatPanel } from "./ChatPanel";
import type { CharacterConfig } from "./ChatPanel";
import { createLlmAdapter } from "@/lib/llm";
import { createAsrAdapter, createTtsAdapter } from "@/lib/speech";

afterEach(cleanup);

// ── Heavy dependency mocks ──────────────────────────────────────────────────

vi.mock("@/lib/llm/localGemmaWorker", () => ({
  LocalGemmaWorkerClient: vi.fn().mockImplementation(() => ({
    preload: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock("@/lib/speech/workerClient", () => ({
  KokoroWorkerClient: vi.fn().mockImplementation(() => ({
    preload: vi.fn().mockResolvedValue(undefined)
  })),
  DistilWhisperWorkerClient: vi.fn().mockImplementation(() => ({
    preload: vi.fn().mockResolvedValue(undefined)
  }))
}));

vi.mock("@/lib/llm", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/llm")>();
  return {
    ...actual,
    createLlmAdapter: vi.fn().mockReturnValue({
      streamText: vi.fn().mockReturnValue((async function* () {})())
    })
  };
});

vi.mock("@/lib/speech", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/speech")>();
  return {
    ...actual,
    createTtsAdapter: vi.fn().mockReturnValue({
      synthesize: vi.fn().mockResolvedValue(new Blob())
    }),
    createAsrAdapter: vi.fn().mockReturnValue({
      transcribe: vi.fn().mockResolvedValue({ text: "" })
    }),
    playTtsResult: vi.fn().mockResolvedValue(undefined)
  };
});

vi.mock("@/lib/avatar/lipSyncEvents", () => ({
  dispatchAvatarLipSyncFrame: vi.fn()
}));

// ── Fixtures ────────────────────────────────────────────────────────────────

const defaultCharacter: CharacterConfig = {
  name: "Andi",
  pronouns: "THEY",
  personality: "You are Andi, a warm but concise avatar companion.",
  greeting: "Hi, what should we work through first?"
};

function renderPanel(overrides: Partial<CharacterConfig> = {}) {
  const onCharacterChange = vi.fn();
  const onModelUrlChange = vi.fn();
  const character = { ...defaultCharacter, ...overrides };
  render(
    <ChatPanel character={character} onCharacterChange={onCharacterChange} onModelUrlChange={onModelUrlChange} />
  );
  return { onCharacterChange, onModelUrlChange };
}

// ── Collapsible sections ─────────────────────────────────────────────────────

describe("ChatPanel collapsible sections", () => {
  it("renders Character and Settings section headers", () => {
    renderPanel();
    expect(screen.getByText("Character", { selector: "summary" })).toBeInTheDocument();
    expect(screen.getByText("Settings", { selector: "summary" })).toBeInTheDocument();
  });

  it("shows character fields and settings fields without any interaction", () => {
    renderPanel();
    // Character section is open by default
    expect(screen.getByPlaceholderText("Character name")).toBeInTheDocument();
    // Settings fields are accessible in the DOM even when section is collapsed
    expect(screen.getByLabelText("Model provider")).toBeInTheDocument();
    expect(screen.getByLabelText("Voice provider")).toBeInTheDocument();
  });
});

// ── Character form ───────────────────────────────────────────────────────────

describe("ChatPanel character form", () => {
  it("shows name, pronouns, and personality fields (Character section is open by default)", () => {
    renderPanel();
    expect(screen.getByPlaceholderText("Character name")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Pronouns" })).toHaveValue("THEY");
    expect(screen.getByPlaceholderText(/personality/i)).toBeInTheDocument();
  });

  it("populates fields with the current character values", () => {
    renderPanel();
    expect(screen.getByDisplayValue(defaultCharacter.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(defaultCharacter.personality)).toBeInTheDocument();
  });

  it("calls onCharacterChange when name is edited", () => {
    const { onCharacterChange } = renderPanel();
    const nameInput = screen.getByPlaceholderText("Character name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Nova" } });
    expect(onCharacterChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Nova" }));
  });

  it("calls onCharacterChange when pronouns are changed", () => {
    const { onCharacterChange } = renderPanel();
    const select = screen.getByRole("combobox", { name: "Pronouns" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "SHE" } });
    expect(onCharacterChange).toHaveBeenCalledWith(expect.objectContaining({ pronouns: "SHE" }));
  });

  it("calls onCharacterChange when personality is edited", () => {
    const { onCharacterChange } = renderPanel();
    const textarea = screen.getByPlaceholderText(/personality/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "A bold adventurer." } });
    expect(onCharacterChange).toHaveBeenCalledWith(
      expect.objectContaining({ personality: "A bold adventurer." })
    );
  });
});

// ── VRM loader ───────────────────────────────────────────────────────────────

describe("ChatPanel VRM loader", () => {
  it("shows a Load VRM button in the Character section", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Load VRM" })).toBeInTheDocument();
  });

  it("shows default lobster model text before any VRM is loaded", () => {
    renderPanel();
    expect(screen.getByText("Default (lobster)")).toBeInTheDocument();
  });

  it("calls onModelUrlChange and shows filename when a VRM file is selected", () => {
    const { onModelUrlChange } = renderPanel();

    const stubUrl = "blob:http://localhost/stub-vrm";
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn().mockReturnValue(stubUrl) });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([""], "myCharacter.vrm", { type: "application/octet-stream" });
    Object.defineProperty(fileInput, "files", { value: [fakeFile], configurable: true });
    fireEvent.change(fileInput);

    expect(onModelUrlChange).toHaveBeenCalledWith(stubUrl);
    expect(screen.getByText("myCharacter.vrm")).toBeInTheDocument();

    vi.unstubAllGlobals();
  });
});

// ── OpenClaw persona handling ────────────────────────────────────────────────

describe("ChatPanel OpenClaw persona handling", () => {
  it("hides character identity fields when OpenClaw provider is selected", () => {
    renderPanel();
    const providerSelect = screen.getByLabelText("Model provider") as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "openclaw" } });
    expect(screen.queryByPlaceholderText("Character name")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/personality/i)).not.toBeInTheDocument();
  });

  it("shows OpenClaw soul system note when OpenClaw is active", () => {
    renderPanel();
    const providerSelect = screen.getByLabelText("Model provider") as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "openclaw" } });
    expect(screen.getByText(/OpenClaw.*soul system/i)).toBeInTheDocument();
  });

  it("restores character fields when switching away from OpenClaw", () => {
    renderPanel();
    const providerSelect = screen.getByLabelText("Model provider") as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "openclaw" } });
    fireEvent.change(providerSelect, { target: { value: "openai" } });
    expect(screen.getByPlaceholderText("Character name")).toBeInTheDocument();
  });
});

// ── Chat interface ───────────────────────────────────────────────────────────

describe("ChatPanel chat interface", () => {
  it("renders the initial greeting from the character", () => {
    renderPanel();
    expect(screen.getByText(defaultCharacter.greeting)).toBeInTheDocument();
  });

  it("renders the message composer input and send button", () => {
    renderPanel();
    expect(screen.getByPlaceholderText("Type a message…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
  });
});

// ── Message list auto-scroll ─────────────────────────────────────────────────

describe("ChatPanel message list auto-scroll", () => {
  it("sets scrollTop to scrollHeight on mount (initial greeting)", () => {
    renderPanel();
    const list = document.querySelector(".message-list") as HTMLElement;
    const scrollTopValues: number[] = [];
    Object.defineProperty(list, "scrollHeight", { get: () => 400, configurable: true });
    Object.defineProperty(list, "scrollTop", {
      set: (v: number) => scrollTopValues.push(v),
      get: () => scrollTopValues[scrollTopValues.length - 1] ?? 0,
      configurable: true
    });
    // Trigger another render by sending a message (streaming mock returns nothing, so status stays idle)
    const input = screen.getByPlaceholderText("Type a message…");
    fireEvent.change(input, { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(scrollTopValues).toContain(400);
  });

  it("message-list element has a ref that can be scrolled", () => {
    renderPanel();
    const list = document.querySelector(".message-list") as HTMLElement;
    expect(list).not.toBeNull();
    // scrollTop assignment should not throw (ref is attached)
    expect(() => { list.scrollTop = list.scrollHeight; }).not.toThrow();
  });
});

// ── Mic auto-submit flow ─────────────────────────────────────────────────────

class MockMediaRecorder {
  state: string = "inactive";
  mimeType: string = "audio/webm";
  private handlers: Record<string, Array<(e: unknown) => void>> = {};

  addEventListener(event: string, handler: (e: unknown) => void) {
    if (!this.handlers[event]) this.handlers[event] = [];
    this.handlers[event].push(handler);
  }

  start() {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.handlers["stop"]?.forEach((h) => h({}));
  }
}

describe("mic auto-submit flow", () => {
  let capturedRecorder: MockMediaRecorder | null = null;

  beforeEach(() => {
    capturedRecorder = null;
    const MockRecorderClass = class extends MockMediaRecorder {
      constructor(...args: unknown[]) {
        super(...args as []);
        capturedRecorder = this;
      }
    };
    vi.stubGlobal("MediaRecorder", MockRecorderClass);

    const mockTrack = { stop: vi.fn() };
    const mockStream = { getTracks: vi.fn().mockReturnValue([mockTrack]) };
    Object.defineProperty(global.navigator, "mediaDevices", {
      value: { getUserMedia: vi.fn().mockResolvedValue(mockStream) },
      writable: true,
      configurable: true
    });

    // jsdom doesn't support setPointerCapture for synthetic events; stub it out
    // so onPointerDown can proceed to startMicRecording.
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    // @ts-expect-error restoring prototype method
    delete HTMLElement.prototype.setPointerCapture;
  });

  it("calls streamText with the transcribed text when mic recording stops", async () => {
    vi.mocked(createAsrAdapter).mockReturnValue({
      transcribe: vi.fn().mockResolvedValue({ text: "Hello from mic" })
    });

    renderPanel();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }));
    await waitFor(() => screen.getByRole("button", { name: "Release to send" }));

    capturedRecorder!.stop();

    await waitFor(() => {
      expect(vi.mocked(createLlmAdapter)).toHaveBeenCalled();
    });

    const streamTextMock = vi.mocked(createLlmAdapter).mock.results[0].value.streamText as ReturnType<typeof vi.fn>;
    expect(streamTextMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([{ role: "user", content: "Hello from mic" }])
      })
    );
  });

  it("does not show the transcript preview panel after mic recording stops", async () => {
    vi.mocked(createAsrAdapter).mockReturnValue({
      transcribe: vi.fn().mockResolvedValue({ text: "Hello from mic" })
    });

    renderPanel();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }));
    await waitFor(() => screen.getByRole("button", { name: "Release to send" }));

    capturedRecorder!.stop();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Hello from mic", { selector: ".transcript-box span" })).not.toBeInTheDocument();
  });
});

// ── Settings model dropdown ───────────────────────────────────────────────────

describe("ChatPanel Settings model dropdown", () => {
  function selectProvider(providerId: string) {
    fireEvent.change(screen.getByLabelText("Model provider"), { target: { value: providerId } });
  }

  // ── New providers appear ────────────────────────────────────────────────

  it("provider dropdown includes Google AI Studio", () => {
    renderPanel();
    selectProvider("google");
    expect(screen.getByLabelText("Model provider")).toHaveValue("google");
  });

  it("provider dropdown includes xAI (Grok)", () => {
    renderPanel();
    selectProvider("xai");
    expect(screen.getByLabelText("Model provider")).toHaveValue("xai");
  });

  it("provider dropdown includes Mistral AI", () => {
    renderPanel();
    selectProvider("mistral");
    expect(screen.getByLabelText("Model provider")).toHaveValue("mistral");
  });

  it("provider dropdown includes Groq", () => {
    renderPanel();
    selectProvider("groq");
    expect(screen.getByLabelText("Model provider")).toHaveValue("groq");
  });

  it("provider dropdown includes Together AI", () => {
    renderPanel();
    selectProvider("together");
    expect(screen.getByLabelText("Model provider")).toHaveValue("together");
  });

  // ── Model control hidden for browser-local-gemma ──────────────────────────

  it("hides model dropdown/input for browser-local-gemma (only one model)", () => {
    renderPanel();
    // Default provider is browser-local-gemma — no model control should be shown
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows model control again after switching away from browser-local-gemma", () => {
    renderPanel();
    selectProvider("anthropic");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  // ── Model control in Advanced (matches onboarding: dropdown when provider has a static list) ─

  it("shows a free-text model input for Ollama (dynamic models)", () => {
    renderPanel();
    selectProvider("ollama");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows a free-text model input for OpenRouter (dynamic gateway)", () => {
    renderPanel();
    selectProvider("openrouter");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
  });

  it("shows a free-text model input for Groq", () => {
    renderPanel();
    selectProvider("groq");
    expect(screen.getByRole("textbox", { name: "Model" })).toBeInTheDocument();
  });

  it("shows a model dropdown for Anthropic (provider with known models)", () => {
    renderPanel();
    selectProvider("anthropic");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("shows a model dropdown for OpenAI", () => {
    renderPanel();
    selectProvider("openai");
    expect(screen.getByRole("combobox", { name: "Model" })).toBeInTheDocument();
  });

  // ── Default models (Advanced section) ─────────────────────────────────────

  it("OpenAI defaults to gpt-5.5", () => {
    renderPanel();
    selectProvider("openai");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("gpt-5.5");
  });

  it("Anthropic defaults to claude-opus-4-7", () => {
    renderPanel();
    selectProvider("anthropic");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("claude-opus-4-7");
  });

  it("Google defaults to gemini-3.1-pro-preview", () => {
    renderPanel();
    selectProvider("google");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("gemini-3.1-pro-preview");
  });

  it("xAI defaults to grok-4", () => {
    renderPanel();
    selectProvider("xai");
    expect(screen.getByRole("combobox", { name: "Model" })).toHaveValue("grok-4");
  });

  // ── Config integration ──────────────────────────────────────────────────

  it("editing the model selection updates the active model", async () => {
    renderPanel();
    selectProvider("anthropic");
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), {
      target: { value: "claude-sonnet-4-5" }
    });
    const input = screen.getByPlaceholderText("Type a message…");
    fireEvent.change(input, { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => {
      expect(vi.mocked(createLlmAdapter)).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ provider: "anthropic", model: "claude-sonnet-4-5" })
        })
      );
    });
  });
});

// ── Settings TTS/STT dropdowns ────────────────────────────────────────────────

describe("ChatPanel Settings TTS dropdown", () => {
  function selectTtsProvider(id: string) {
    fireEvent.change(screen.getByLabelText("Voice provider"), { target: { value: id } });
  }

  it("Voice provider dropdown includes OpenAI TTS", () => {
    renderPanel();
    selectTtsProvider("openai");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("openai");
  });

  it("Voice provider dropdown includes Google TTS", () => {
    renderPanel();
    selectTtsProvider("google");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("google");
  });

  it("Voice provider dropdown includes xAI TTS", () => {
    renderPanel();
    selectTtsProvider("xai");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("xai");
  });

  it("Voice provider dropdown includes MiniMax", () => {
    renderPanel();
    selectTtsProvider("minimax");
    expect(screen.getByLabelText("Voice provider")).toHaveValue("minimax");
  });

  it("non-Kokoro TTS provider shows Voice credential field", () => {
    renderPanel();
    selectTtsProvider("elevenlabs");
    expect(screen.getByLabelText("Voice credential")).toBeInTheDocument();
  });

  it("Kokoro TTS does not show Voice credential field", () => {
    renderPanel();
    // Kokoro is the default
    expect(screen.queryByLabelText("Voice credential")).not.toBeInTheDocument();
  });
});

// ── Streaming TTS pipeline ───────────────────────────────────────────────────

describe("ChatPanel streaming TTS pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts TTS synthesis before the LLM stream finishes", async () => {
    let resumeStream: (() => void) | null = null;

    vi.mocked(createLlmAdapter).mockReturnValueOnce({
      streamText: vi.fn().mockReturnValue(
        (async function* () {
          yield "Hello. ";
          await new Promise<void>((r) => {
            resumeStream = r;
          });
          yield "Goodbye.";
        })()
      )
    });

    const synthesize = vi
      .fn()
      .mockResolvedValue({ audio: new ArrayBuffer(4), mimeType: "audio/wav" });
    vi.mocked(createTtsAdapter).mockReturnValueOnce({ synthesize, provider: "kokoro" });

    renderPanel();
    fireEvent.change(screen.getByPlaceholderText("Type a message…"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    // Synthesis of the first sentence should start before the stream ends
    await waitFor(() => {
      expect(synthesize).toHaveBeenCalledTimes(1);
    });

    // Confirm the stream is still paused (not yet finished)
    expect(resumeStream).not.toBeNull();
    expect(synthesize).toHaveBeenCalledWith(expect.stringContaining("Hello."));

    // Now resume the stream and allow it to finish
    resumeStream!();

    await waitFor(() => {
      expect(synthesize).toHaveBeenCalledTimes(2);
    });
    expect(synthesize).toHaveBeenCalledWith(expect.stringContaining("Goodbye."));
  });

  it("synthesizes each sentence chunk separately", async () => {
    vi.mocked(createLlmAdapter).mockReturnValueOnce({
      streamText: vi.fn().mockReturnValue(
        (async function* () {
          yield "First sentence. Second sentence. Third.";
        })()
      )
    });

    const synthesize = vi
      .fn()
      .mockResolvedValue({ audio: new ArrayBuffer(4), mimeType: "audio/wav" });
    vi.mocked(createTtsAdapter).mockReturnValueOnce({ synthesize, provider: "kokoro" });

    renderPanel();
    fireEvent.change(screen.getByPlaceholderText("Type a message…"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(synthesize).toHaveBeenCalledTimes(3);
    });
    expect(synthesize).toHaveBeenNthCalledWith(1, "First sentence.");
    expect(synthesize).toHaveBeenNthCalledWith(2, "Second sentence.");
    expect(synthesize).toHaveBeenNthCalledWith(3, "Third.");
  });

  it("rewrites decimals before synthesis", async () => {
    vi.mocked(createLlmAdapter).mockReturnValueOnce({
      streamText: vi.fn().mockReturnValue(
        (async function* () {
          yield "The score is 9.5 out of 10.";
        })()
      )
    });

    const synthesize = vi
      .fn()
      .mockResolvedValue({ audio: new ArrayBuffer(4), mimeType: "audio/wav" });
    vi.mocked(createTtsAdapter).mockReturnValueOnce({ synthesize, provider: "kokoro" });

    renderPanel();
    fireEvent.change(screen.getByPlaceholderText("Type a message…"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(synthesize).toHaveBeenCalled();
    });
    expect(synthesize).toHaveBeenCalledWith("The score is 9 point 5 out of 10.");
  });
});

describe("ChatPanel speech input provider dropdown", () => {
  function selectSpeechInputProvider(id: string) {
    fireEvent.change(screen.getByLabelText("Speech input provider"), { target: { value: id } });
  }

  it("Speech input dropdown includes Deepgram", () => {
    renderPanel();
    selectSpeechInputProvider("deepgram");
    expect(screen.getByLabelText("Speech input provider")).toHaveValue("deepgram");
  });

  it("Speech input dropdown includes ElevenLabs STT", () => {
    renderPanel();
    selectSpeechInputProvider("elevenlabs");
    expect(screen.getByLabelText("Speech input provider")).toHaveValue("elevenlabs");
  });

  it("Deepgram speech input shows Transcription credential field", () => {
    renderPanel();
    selectSpeechInputProvider("deepgram");
    expect(screen.getByLabelText("Transcription credential")).toBeInTheDocument();
  });
});

// ── Local model preloading ────────────────────────────────────────────────────

describe("ChatPanel local model preloading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not start preloading on mount without shouldPreloadLocalModels", async () => {
    renderPanel();
    // Wait through multiple microtask ticks; models should never transition away from Waiting
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    expect(screen.getAllByText("Waiting")).toHaveLength(3);
  });

  it("keeps model status as Waiting when shouldPreloadLocalModels is not set", async () => {
    renderPanel();
    await Promise.resolve();
    const waitingStatuses = screen.getAllByText("Waiting");
    expect(waitingStatuses).toHaveLength(3);
  });

  it("starts preloading and shows Ready when shouldPreloadLocalModels is true", async () => {
    render(
      <ChatPanel
        character={defaultCharacter}
        onCharacterChange={vi.fn()}
        onModelUrlChange={vi.fn()}
        shouldPreloadLocalModels={true}
      />
    );
    await waitFor(() => {
      expect(screen.getAllByText("Ready")).toHaveLength(3);
    });
  });

  // The monotonic progress clamping logic (high-water-mark) is unit-tested
  // directly in chatPanelUtils.test.ts → "clampModelProgress".
});
