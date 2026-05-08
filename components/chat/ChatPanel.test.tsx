// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ChatPanel, _clearPreloadSessionsForTesting } from "./ChatPanel";
import type { CharacterConfig } from "./ChatPanel";
import { createLlmAdapter } from "@/lib/llm";
import { createAsrAdapter, createAsrRealtimeSession, createTtsAdapter } from "@/lib/speech";

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
      id: "browser-local-gemma",
      streamText: vi.fn().mockReturnValue((async function* () {})())
    })
  };
});

vi.mock("@/lib/speech", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/speech")>();
  return {
    ...actual,
    createTtsAdapter: vi.fn().mockReturnValue({
      provider: "kokoro",
      synthesize: vi.fn().mockResolvedValue(new Blob())
    }),
    createAsrAdapter: vi.fn().mockReturnValue({
      provider: "distil-whisper",
      transcribe: vi.fn().mockResolvedValue({ text: "" })
    }),
    createAsrRealtimeSession: vi.fn(),
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

function renderPanelWithConfig(options: Partial<React.ComponentProps<typeof ChatPanel>> = {}) {
  const onCharacterChange = vi.fn();
  const onModelUrlChange = vi.fn();
  render(
    <ChatPanel
      character={defaultCharacter}
      onCharacterChange={onCharacterChange}
      onModelUrlChange={onModelUrlChange}
      {...options}
    />
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
    // Settings readouts are accessible in the DOM even when section is collapsed
    expect(screen.getByRole("group", { name: "Model provider" })).toHaveTextContent("Browser local (Gemma)");
    expect(screen.getByRole("group", { name: "Voice provider" })).toHaveTextContent("Kokoro local");
  });

  it("shows the Google Live control when realtime voice is configured", () => {
    renderPanelWithConfig({
      initialRealtimeVoiceConfig: {
        provider: "google-live",
        credential: "google-key",
        model: "gemini-live",
        voice: "Kore"
      }
    });
    expect(screen.getAllByRole("button", { name: /start google live/i })).toHaveLength(2);
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

  it("does not show a Reset button when no custom VRM is loaded", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
  });

  it("shows a Reset button after a custom VRM is loaded", () => {
    renderPanel();
    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn().mockReturnValue("blob:x") });

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([""], "custom.vrm", { type: "application/octet-stream" });
    Object.defineProperty(fileInput, "files", { value: [fakeFile], configurable: true });
    fireEvent.change(fileInput);

    expect(screen.getByRole("button", { name: "Reset" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("clicking Reset restores default filename and calls onVrmReset", () => {
    const onVrmReset = vi.fn();
    const onModelUrlChange = vi.fn();
    render(
      <ChatPanel
        character={defaultCharacter}
        onCharacterChange={vi.fn()}
        onModelUrlChange={onModelUrlChange}
        onVrmReset={onVrmReset}
      />
    );

    vi.stubGlobal("URL", { ...URL, createObjectURL: vi.fn().mockReturnValue("blob:x") });
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const fakeFile = new File([""], "custom.vrm", { type: "application/octet-stream" });
    Object.defineProperty(fileInput, "files", { value: [fakeFile], configurable: true });
    fireEvent.change(fileInput);

    fireEvent.click(screen.getByRole("button", { name: "Reset" }));

    expect(onVrmReset).toHaveBeenCalledOnce();
    expect(screen.getByText("Default (lobster)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reset" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

// ── OpenClaw persona handling ────────────────────────────────────────────────

describe("ChatPanel OpenClaw persona handling", () => {
  it("hides character identity fields when OpenClaw provider is active", () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "openclaw",
        model: "openclaw",
        baseUrl: "http://127.0.0.1:18789/v1",
        endpointMode: "openai-compatible"
      }
    });
    expect(screen.queryByPlaceholderText("Character name")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/personality/i)).not.toBeInTheDocument();
  });

  it("shows OpenClaw soul system note when OpenClaw is active", () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "openclaw",
        model: "openclaw",
        baseUrl: "http://127.0.0.1:18789/v1",
        endpointMode: "openai-compatible"
      }
    });
    expect(screen.getByText(/OpenClaw.*soul system/i)).toBeInTheDocument();
  });

  it("shows character fields when a non-OpenClaw provider is active", () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "openai",
        model: "gpt-5.5",
        baseUrl: "https://api.openai.com/v1",
        endpointMode: "openai-compatible"
      }
    });
    expect(screen.getByPlaceholderText("Character name")).toBeInTheDocument();
  });

  it("hides OpenClaw token and setup command in chat settings", () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "openclaw",
        model: "openclaw",
        credential: "gateway-token",
        baseUrl: "http://127.0.0.1:18789/v1",
        endpointMode: "openai-compatible"
      }
    });

    expect(screen.getByRole("group", { name: "Model provider" })).toHaveTextContent("OpenClaw Gateway");
    expect(screen.queryByLabelText("OpenClaw Gateway token")).not.toBeInTheDocument();
    expect(screen.queryByText(/OpenClaw setup/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /copy openclaw setup command/i })).not.toBeInTheDocument();
  });

  it("sends the configured OpenClaw gateway token as the active LLM credential", async () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "openclaw",
        model: "openclaw",
        credential: "gateway-token",
        baseUrl: "http://127.0.0.1:18789/v1",
        endpointMode: "openai-compatible"
      }
    });
    fireEvent.change(screen.getByPlaceholderText("Type a message…"), { target: { value: "hello" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(vi.mocked(createLlmAdapter)).toHaveBeenCalledWith(
        expect.objectContaining({
          config: expect.objectContaining({ provider: "openclaw", credential: "gateway-token" })
        })
      );
    });
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

  start(_timeslice?: number) {
    this.state = "recording";
  }

  stop() {
    this.state = "inactive";
    this.handlers["stop"]?.forEach((h) => h({}));
  }
}

describe("mic auto-submit flow", () => {
  let capturedRecorder: MockMediaRecorder | null = null;
  let getUserMediaMock: ReturnType<typeof vi.fn>;
  let latestRealtimeCallbacks: { onPartial?: (text: string) => void; onTranscript?: (text: string, event: { final: boolean }) => void; onError?: (error: Error) => void } | null = null;
  let latestRealtimeSession: { stop: ReturnType<typeof vi.fn>; isActive: ReturnType<typeof vi.fn> } | null = null;

  beforeEach(() => {
    vi.clearAllMocks();
    capturedRecorder = null;
    latestRealtimeCallbacks = null;
    latestRealtimeSession = null;
    const MockRecorderClass = class extends MockMediaRecorder {
      constructor(...args: unknown[]) {
        super(...args as []);
        capturedRecorder = this;
      }
    };
    vi.stubGlobal("MediaRecorder", MockRecorderClass);

    const mockTrack = { readyState: "live", stop: vi.fn() };
    const mockStream = {
      getAudioTracks: vi.fn().mockReturnValue([mockTrack]),
      getTracks: vi.fn().mockReturnValue([mockTrack])
    };
    getUserMediaMock = vi.fn().mockResolvedValue(mockStream);
    Object.defineProperty(global.navigator, "mediaDevices", {
      value: { getUserMedia: getUserMediaMock },
      writable: true,
      configurable: true
    });

    // jsdom doesn't support setPointerCapture for synthetic events; stub it out
    // so onPointerDown can proceed to startMicRecording.
    HTMLElement.prototype.setPointerCapture = vi.fn();

    vi.mocked(createAsrAdapter).mockReturnValue({
      provider: "distil-whisper",
      transcribe: vi.fn().mockResolvedValue({ text: "" })
    });
    vi.mocked(createAsrRealtimeSession).mockImplementation((input) => {
      latestRealtimeCallbacks = input;
      let recorder: MediaRecorder | null = null;
      let active = false;
      const stop = vi.fn(() => {
        if (recorder && active) recorder.stop();
        return Promise.resolve("");
      });
      const session = {
        start(stream: MediaStream) {
          recorder = new MediaRecorder(stream);
          recorder.addEventListener("stop", () => {
            active = false;
            const adapter = vi.mocked(createAsrAdapter).mock.results.at(-1)?.value ?? createAsrAdapter({ config: { provider: "distil-whisper" } });
            void adapter.transcribe(new Blob(["audio"], { type: "audio/webm" })).then(
              (result: { text: string }) => input.onTranscript?.(result.text, { final: true }),
              (caught: unknown) => input.onError?.(caught instanceof Error ? caught : new Error("Transcription failed."))
            );
          });
          recorder.start(5000);
          active = true;
        },
        stop,
        isActive: vi.fn(() => {
          return active;
        }),
        sendAudio: vi.fn()
      };
      latestRealtimeSession = session;
      return session;
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    // @ts-expect-error restoring prototype method
    delete HTMLElement.prototype.setPointerCapture;
  });

  function chooseMicMode(label: string) {
    fireEvent.click(screen.getByRole("button", { name: "Mic mode" }));
    fireEvent.click(screen.getByRole("menuitem", { name: label }));
  }

  it("requests microphone permission when the panel mounts", async () => {
    renderPanel();

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledWith({ audio: true });
    });
  });

  it("reuses the startup microphone stream when recording starts", async () => {
    renderPanel();

    await waitFor(() => {
      expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    });

    chooseMicMode("Hold");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }));
    await waitFor(() => screen.getByRole("button", { name: "Release to send" }));

    expect(getUserMediaMock).toHaveBeenCalledTimes(1);
    expect(capturedRecorder).not.toBeNull();
  });

  it("renders a mic mode dropdown with auto selected by default", () => {
    renderPanel();

    const modeButton = screen.getByRole("button", { name: "Mic mode" });
    expect(modeButton).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Start dynamic recording" })).toBeInTheDocument();
  });

  it("renders the mic action and mode dropdown as one split button", () => {
    renderPanel();

    const splitButton = screen.getByRole("group", { name: "Mic controls" });
    expect(splitButton).toContainElement(screen.getByRole("button", { name: "Start dynamic recording" }));
    expect(splitButton).toContainElement(screen.getByRole("button", { name: "Mic mode" }));
  });

  it("keeps mode text off the dropdown segment and shows choices in a full-width menu", () => {
    renderPanel();

    const splitButton = screen.getByRole("group", { name: "Mic controls" });
    const modeButton = screen.getByRole("button", { name: "Mic mode" });
    expect(modeButton).toHaveTextContent("");

    fireEvent.click(modeButton);
    const menu = screen.getByRole("menu", { name: "Mic mode" });
    expect(splitButton).toContainElement(menu);
    expect(menu).toHaveClass("mic-mode-menu");
  });

  it("supports click-to-start and click-to-stop mic mode", async () => {
    renderPanel();
    chooseMicMode("Tap");

    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    await waitFor(() => screen.getByRole("button", { name: "Stop recording" }));
    expect(latestRealtimeSession?.stop).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    await waitFor(() => {
      expect(latestRealtimeSession?.stop).toHaveBeenCalledTimes(1);
    });
  });

  it("does not stop click-to-start mode when the pointer leaves the mic button", async () => {
    renderPanel();
    chooseMicMode("Tap");

    const micButton = screen.getByRole("button", { name: "Start recording" });
    fireEvent.click(micButton);
    await waitFor(() => screen.getByRole("button", { name: "Stop recording" }));
    fireEvent.pointerLeave(screen.getByRole("button", { name: "Stop recording" }));

    expect(latestRealtimeSession?.stop).not.toHaveBeenCalled();
  });

  it("supports dynamic mode and keeps the realtime session active until silence detection stops it", async () => {
    renderPanel();
    chooseMicMode("Auto");

    fireEvent.click(screen.getByRole("button", { name: "Start dynamic recording" }));
    await waitFor(() => screen.getByRole("button", { name: "Listening for pause" }));

    expect(createAsrRealtimeSession).toHaveBeenCalled();
    expect(latestRealtimeSession?.stop).not.toHaveBeenCalled();
  });

  it("stops dynamic mode after 1500ms of silence following speech", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    let audioProcess: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null = null;
    class MockAudioContext {
      destination = {};
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      createScriptProcessor() {
        return {
          connect: vi.fn(),
          disconnect: vi.fn(),
          get onaudioprocess() {
            return audioProcess;
          },
          set onaudioprocess(handler) {
            audioProcess = handler;
          }
        };
      }
      close = vi.fn();
    }
    vi.stubGlobal("AudioContext", MockAudioContext);

    renderPanel();
    chooseMicMode("Auto");
    fireEvent.click(screen.getByRole("button", { name: "Start dynamic recording" }));
    await vi.advanceTimersByTimeAsync(0);

    const dispatchAudio = (samples: number[]) => {
      if (!audioProcess) throw new Error("Dynamic mic detector did not attach an audio process handler.");
      audioProcess({ inputBuffer: { getChannelData: () => new Float32Array(samples) } });
    };

    dispatchAudio([0.1, 0.1, 0.1]);
    await vi.advanceTimersByTimeAsync(250);
    dispatchAudio([0.1, 0.1, 0.1]);
    await vi.advanceTimersByTimeAsync(1499);
    dispatchAudio([0, 0, 0]);
    expect(latestRealtimeSession?.stop).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    dispatchAudio([0, 0, 0]);
    expect(latestRealtimeSession?.stop).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("does not arm dynamic silence detection for a brief noise spike", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    let audioProcess: ((event: { inputBuffer: { getChannelData: () => Float32Array } }) => void) | null = null;
    class MockAudioContext {
      destination = {};
      createMediaStreamSource() {
        return { connect: vi.fn(), disconnect: vi.fn() };
      }
      createScriptProcessor() {
        return {
          connect: vi.fn(),
          disconnect: vi.fn(),
          get onaudioprocess() {
            return audioProcess;
          },
          set onaudioprocess(handler) {
            audioProcess = handler;
          }
        };
      }
      close = vi.fn();
    }
    vi.stubGlobal("AudioContext", MockAudioContext);

    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Start dynamic recording" }));
    await vi.advanceTimersByTimeAsync(0);

    const dispatchAudio = (samples: number[]) => {
      if (!audioProcess) throw new Error("Dynamic mic detector did not attach an audio process handler.");
      audioProcess({ inputBuffer: { getChannelData: () => new Float32Array(samples) } });
    };

    dispatchAudio([0.1, 0.1, 0.1]);
    await vi.advanceTimersByTimeAsync(1600);
    dispatchAudio([0, 0, 0]);

    expect(latestRealtimeSession?.stop).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("calls streamText with the transcribed text when mic recording stops", async () => {
    vi.mocked(createAsrAdapter).mockReturnValue({
      provider: "distil-whisper",
      transcribe: vi.fn().mockResolvedValue({ text: "Hello from mic" })
    });

    renderPanel();

    chooseMicMode("Hold");
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
      provider: "distil-whisper",
      transcribe: vi.fn().mockResolvedValue({ text: "Hello from mic" })
    });

    renderPanel();

    chooseMicMode("Hold");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }));
    await waitFor(() => screen.getByRole("button", { name: "Release to send" }));

    capturedRecorder!.stop();

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Use" })).not.toBeInTheDocument();
    });
    expect(screen.queryByText("Hello from mic", { selector: ".transcript-box span" })).not.toBeInTheDocument();
  });

  it("shows live partial transcript text while recording is being processed", async () => {
    renderPanel();

    chooseMicMode("Hold");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }));
    await waitFor(() => screen.getByRole("button", { name: "Release to send" }));

    latestRealtimeCallbacks?.onPartial?.("Live words so far");

    await waitFor(() => {
      expect(screen.getByText("Live words so far", { selector: ".transcript-box span" })).toBeInTheDocument();
    });
  });

  it("ignores stale transcription callbacks after a newer mic session starts", async () => {
    renderPanel();

    chooseMicMode("Hold");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }));
    await waitFor(() => screen.getByRole("button", { name: "Release to send" }));
    const firstCallbacks = latestRealtimeCallbacks;

    capturedRecorder!.stop();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Release to send" }));
    await waitFor(() => {
      expect(createAsrRealtimeSession).toHaveBeenCalledTimes(2);
    });

    firstCallbacks?.onTranscript?.("stale text", { final: true });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(vi.mocked(createLlmAdapter)).not.toHaveBeenCalled();
  });

  it("auto-restarts mic recording after full LLM + TTS completion in dynamic mode", async () => {
    vi.mocked(createLlmAdapter).mockReturnValueOnce({
      id: "browser-local-gemma",
      streamText: vi.fn().mockReturnValue(
        (async function* () { yield "Hello there."; })()
      )
    });

    renderPanel(); // default: dynamic mode

    fireEvent.change(screen.getByPlaceholderText("Type a message…"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Listening for pause" })).toBeInTheDocument();
    });
    expect(createAsrRealtimeSession).toHaveBeenCalledTimes(1);
  });

  it("does not auto-restart mic recording after TTS in hold mode", async () => {
    vi.mocked(createLlmAdapter).mockReturnValueOnce({
      id: "browser-local-gemma",
      streamText: vi.fn().mockReturnValue(
        (async function* () { yield "Hello there."; })()
      )
    });

    renderPanel();
    chooseMicMode("Hold");

    fireEvent.change(screen.getByPlaceholderText("Type a message…"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Hold to talk" })).not.toBeDisabled());
    await new Promise((r) => setTimeout(r, 0));
    expect(createAsrRealtimeSession).not.toHaveBeenCalled();
  });

  it("does not auto-restart mic recording after TTS in tap mode", async () => {
    vi.mocked(createLlmAdapter).mockReturnValueOnce({
      id: "browser-local-gemma",
      streamText: vi.fn().mockReturnValue(
        (async function* () { yield "Hello there."; })()
      )
    });

    renderPanel();
    chooseMicMode("Tap");

    fireEvent.change(screen.getByPlaceholderText("Type a message…"), { target: { value: "hi" } });
    fireEvent.click(screen.getByRole("button", { name: "Send" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Start recording" })).not.toBeDisabled());
    await new Promise((r) => setTimeout(r, 0));
    expect(createAsrRealtimeSession).not.toHaveBeenCalled();
  });

  it("surfaces transcription errors and does not submit partial text on failure", async () => {
    vi.mocked(createAsrRealtimeSession).mockImplementation((input) => {
      latestRealtimeCallbacks = input;
      return {
        start: vi.fn(),
        stop: vi.fn().mockResolvedValue(""),
        isActive: vi.fn().mockReturnValue(true),
        sendAudio: vi.fn()
      };
    });
    vi.mocked(createLlmAdapter).mockClear();

    renderPanel();
    chooseMicMode("Hold");
    fireEvent.pointerDown(screen.getByRole("button", { name: "Hold to talk" }));
    await waitFor(() => screen.getByRole("button", { name: "Release to send" }));

    latestRealtimeCallbacks?.onTranscript?.("partial text", { final: false });
    latestRealtimeCallbacks?.onError?.(new Error("Transcription failed hard"));

    await waitFor(() => {
      expect(screen.getByText("Transcription failed hard")).toBeInTheDocument();
    });
    expect(vi.mocked(createLlmAdapter)).not.toHaveBeenCalled();
  });
});

// ── Settings model dropdown ───────────────────────────────────────────────────

describe("ChatPanel Settings readouts", () => {
  it("shows provider and model values without editable Settings controls", () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        baseUrl: "https://api.anthropic.com",
        endpointMode: "native"
      }
    });

    expect(screen.getByRole("group", { name: "Model provider" })).toHaveTextContent("Anthropic API");
    expect(screen.getByRole("group", { name: "Model" })).toHaveTextContent("claude-sonnet-4-5");
    expect(screen.queryByRole("combobox", { name: "Model provider" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });

  it("keeps Settings read-only and uses the configured model for chat", async () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        baseUrl: "https://api.anthropic.com",
        endpointMode: "native"
      }
    });

    fireEvent.change(screen.getByPlaceholderText("Type a message…"), { target: { value: "hello" } });
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
// Settings TTS/STT readouts

describe("ChatPanel Settings TTS readout", () => {
  it("shows the active Voice provider without an editable dropdown", () => {
    renderPanelWithConfig({
      initialTtsConfig: {
        provider: "elevenlabs",
        voiceId: "Rachel",
        modelId: "eleven_multilingual_v2",
        credential: "tts-key"
      }
    });

    expect(screen.getByRole("group", { name: "Voice provider" })).toHaveTextContent("ElevenLabs");
    expect(screen.queryByRole("combobox", { name: "Voice provider" })).not.toBeInTheDocument();
  });

  it("hides TTS credential fields in Settings", () => {
    renderPanelWithConfig({
      initialTtsConfig: {
        provider: "elevenlabs",
        voiceId: "Rachel",
        modelId: "eleven_multilingual_v2",
        credential: "tts-key"
      }
    });

    expect(screen.queryByLabelText("Voice credential")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("API key")).not.toBeInTheDocument();
  });
});
// Streaming TTS pipeline

describe("ChatPanel streaming TTS pipeline", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("starts TTS synthesis before the LLM stream finishes", async () => {
    let resumeStream: (() => void) | null = null;

    vi.mocked(createLlmAdapter).mockReturnValueOnce({
      id: "browser-local-gemma",
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
      id: "browser-local-gemma",
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
      id: "browser-local-gemma",
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

describe("ChatPanel speech input provider readout", () => {
  it("shows the active Speech input provider without an editable dropdown", () => {
    renderPanelWithConfig({
      initialAsrConfig: {
        provider: "deepgram",
        credential: "stt-key",
        model: "nova-3"
      }
    });

    expect(screen.getByRole("group", { name: "Speech input provider" })).toHaveTextContent("Deepgram");
    expect(screen.queryByRole("combobox", { name: "Speech input provider" })).not.toBeInTheDocument();
  });

  it("hides STT credential fields in Settings", () => {
    renderPanelWithConfig({
      initialAsrConfig: {
        provider: "deepgram",
        credential: "stt-key",
        model: "nova-3"
      }
    });

    expect(screen.queryByLabelText("Transcription credential")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("API key")).not.toBeInTheDocument();
  });
});
// Local model preloading

describe("ChatPanel local model preloading", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _clearPreloadSessionsForTesting();
    localStorage.clear();
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

  it("still preloads cached local speech models so their first inference is warm", async () => {
    const { LocalGemmaWorkerClient } = await import("@/lib/llm/localGemmaWorker");
    const { KokoroWorkerClient, DistilWhisperWorkerClient } = await import("@/lib/speech/workerClient");
    const cachedResponse = { headers: { get: vi.fn().mockReturnValue("1024") } };
    const cache = {
      keys: vi.fn().mockResolvedValue(["https://example.test/model.onnx"]),
      match: vi.fn().mockResolvedValue(cachedResponse)
    };
    Object.defineProperty(globalThis, "caches", {
      configurable: true,
      value: {
        keys: vi.fn().mockResolvedValue(["liteforms-transformers-cache-v1"]),
        open: vi.fn().mockResolvedValue(cache)
      }
    });
    localStorage.setItem(
      "liteforms.localModels",
      JSON.stringify({
        version: 2,
        storedAt: "2026-05-06T00:00:00.000Z",
        downloadedIds: ["gemma", "kokoro", "distil-whisper"],
        models: []
      })
    );

    render(
      <ChatPanel
        character={defaultCharacter}
        onCharacterChange={vi.fn()}
        onModelUrlChange={vi.fn()}
        shouldPreloadLocalModels={true}
      />
    );

    await waitFor(() => {
      expect(vi.mocked(KokoroWorkerClient).mock.results.at(0)?.value.preload).toHaveBeenCalledTimes(1);
      expect(vi.mocked(DistilWhisperWorkerClient).mock.results.at(0)?.value.preload).toHaveBeenCalledTimes(1);
    });

    expect(screen.getByText("Cached")).toBeInTheDocument();
    expect(screen.getAllByText("Ready")).toHaveLength(2);
    expect(vi.mocked(LocalGemmaWorkerClient).mock.results.at(0)?.value.preload).not.toHaveBeenCalled();
  });

  it("throttles rapid progress events and still reaches Ready after flush", async () => {
    const { LocalGemmaWorkerClient } = await import("@/lib/llm/localGemmaWorker");
    // Preload fires 50 rapid progress events then resolves — simulates many
    // small-chunk download messages arriving on a slow connection.
    vi.mocked(LocalGemmaWorkerClient).mockImplementationOnce(() => ({
      preload: vi.fn().mockImplementation(
        (_opts: unknown, onProgress: (p: { progress: number; message: string }) => void) => {
          for (let i = 1; i <= 50; i++) onProgress({ progress: i * 2, message: `Loading ${i * 2}%` });
          return Promise.resolve(undefined);
        }
      )
    }) as never);

    render(
      <ChatPanel
        character={defaultCharacter}
        onCharacterChange={vi.fn()}
        onModelUrlChange={vi.fn()}
        shouldPreloadLocalModels={true}
      />
    );

    // waitFor retries until the 100ms throttle window flushes, then Ready is shown.
    await waitFor(
      () => {
        // gemma goes Ready (Qwen is "Not used"), kokoro + distil-whisper go Ready too
        expect(screen.getAllByText("Ready")).toHaveLength(3);
      },
      { timeout: 2000 }
    );
  });

  // The monotonic progress clamping logic (high-water-mark) is unit-tested
  // directly in chatPanelUtils.test.ts → "clampModelProgress".
});

// ── Qwen 3.5 local provider ───────────────────────────────────────────────────

describe("ChatPanel Qwen 3.5 local provider", () => {
  it("browser-local-qwen appears in the provider readout when configured", () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "browser-local-qwen",
        model: "onnx-community/Qwen3.5-0.8B-ONNX",
        endpointMode: "native"
      }
    });
    expect(screen.getByRole("group", { name: "Model provider" })).toHaveTextContent("Browser local (Qwen)");
  });

  it("does not render editable Model controls for browser-local-qwen", () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "browser-local-qwen",
        model: "onnx-community/Qwen3.5-0.8B-ONNX",
        endpointMode: "native"
      }
    });
    expect(screen.queryByRole("combobox", { name: "Model" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Model" })).not.toBeInTheDocument();
  });
});
// Active-only local model display

describe("ChatPanel advanced panel shows only selected local models", () => {
  it("shows only 3 models (gemma+kokoro+distil-whisper) by default (browser-local-gemma provider)", async () => {
    renderPanel();
    await new Promise<void>((r) => setTimeout(r, 0));
    // Default: browser-local-gemma + kokoro + distil-whisper — qwen-local should NOT appear
    expect(screen.getAllByText("Waiting")).toHaveLength(3);
  });

  it("does not show qwen-local row when provider is browser-local-gemma", async () => {
    renderPanel();
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(screen.queryByText("Qwen 3.5 0.8B")).not.toBeInTheDocument();
  });

  it("shows qwen-local row when provider is browser-local-qwen", async () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "browser-local-qwen",
        model: "onnx-community/Qwen3.5-0.8B-ONNX",
        endpointMode: "native"
      }
    });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(screen.getByText("Qwen 3.5 0.8B")).toBeInTheDocument();
  });

  it("hides gemma row when provider is browser-local-qwen", async () => {
    renderPanelWithConfig({
      initialLlmConfig: {
        provider: "browser-local-qwen",
        model: "onnx-community/Qwen3.5-0.8B-ONNX",
        endpointMode: "native"
      }
    });
    await new Promise<void>((r) => setTimeout(r, 0));
    expect(screen.queryByText("Gemma 4 E2B q8")).not.toBeInTheDocument();
  });
});

