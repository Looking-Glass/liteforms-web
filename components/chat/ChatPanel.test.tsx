// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { ChatPanel } from "./ChatPanel";
import type { CharacterConfig } from "./ChatPanel";

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

function switchToCharacterTab() {
  fireEvent.click(screen.getByRole("button", { name: "Character" }));
}

// ── Tab bar ─────────────────────────────────────────────────────────────────

describe("ChatPanel tab bar", () => {
  it("renders Settings and Character tabs", () => {
    renderPanel();
    expect(screen.getByRole("button", { name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Character" })).toBeInTheDocument();
  });

  it("shows Settings tab content by default", () => {
    renderPanel();
    expect(screen.getByLabelText("Model settings")).toBeInTheDocument();
    expect(screen.getByLabelText("Speech settings")).toBeInTheDocument();
    expect(screen.queryByLabelText("Character settings")).not.toBeInTheDocument();
  });

  it("switches to Character tab on click", () => {
    renderPanel();
    switchToCharacterTab();
    expect(screen.getByLabelText("Character settings")).toBeInTheDocument();
    expect(screen.queryByLabelText("Model settings")).not.toBeInTheDocument();
  });

  it("switches back to Settings tab on click", () => {
    renderPanel();
    switchToCharacterTab();
    fireEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(screen.getByLabelText("Model settings")).toBeInTheDocument();
    expect(screen.queryByLabelText("Character settings")).not.toBeInTheDocument();
  });
});

// ── Character form ───────────────────────────────────────────────────────────

describe("ChatPanel character form", () => {
  it("shows name, pronouns, and personality fields in the Character tab", () => {
    renderPanel();
    switchToCharacterTab();
    expect(screen.getByPlaceholderText("Character name")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Pronouns" })).toHaveValue("THEY");
    expect(screen.getByPlaceholderText(/personality/i)).toBeInTheDocument();
  });

  it("populates fields with the current character values", () => {
    renderPanel();
    switchToCharacterTab();
    expect(screen.getByDisplayValue(defaultCharacter.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(defaultCharacter.personality)).toBeInTheDocument();
  });

  it("calls onCharacterChange when name is edited", () => {
    const { onCharacterChange } = renderPanel();
    switchToCharacterTab();
    const nameInput = screen.getByPlaceholderText("Character name") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "Nova" } });
    expect(onCharacterChange).toHaveBeenCalledWith(expect.objectContaining({ name: "Nova" }));
  });

  it("calls onCharacterChange when pronouns are changed", () => {
    const { onCharacterChange } = renderPanel();
    switchToCharacterTab();
    const select = screen.getByRole("combobox", { name: "Pronouns" }) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "SHE" } });
    expect(onCharacterChange).toHaveBeenCalledWith(expect.objectContaining({ pronouns: "SHE" }));
  });

  it("calls onCharacterChange when personality is edited", () => {
    const { onCharacterChange } = renderPanel();
    switchToCharacterTab();
    const textarea = screen.getByPlaceholderText(/personality/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "A bold adventurer." } });
    expect(onCharacterChange).toHaveBeenCalledWith(
      expect.objectContaining({ personality: "A bold adventurer." })
    );
  });
});

// ── VRM loader ───────────────────────────────────────────────────────────────

describe("ChatPanel VRM loader", () => {
  it("shows a Load VRM button in the Character tab", () => {
    renderPanel();
    switchToCharacterTab();
    expect(screen.getByRole("button", { name: "Load VRM" })).toBeInTheDocument();
  });

  it("shows default lobster model text before any VRM is loaded", () => {
    renderPanel();
    switchToCharacterTab();
    expect(screen.getByText("Using default (lobster)")).toBeInTheDocument();
  });

  it("calls onModelUrlChange and shows filename when a VRM file is selected", () => {
    const { onModelUrlChange } = renderPanel();
    switchToCharacterTab();

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
    switchToCharacterTab();
    expect(screen.queryByPlaceholderText("Character name")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/personality/i)).not.toBeInTheDocument();
  });

  it("shows OpenClaw soul system note when OpenClaw is active", () => {
    renderPanel();
    const providerSelect = screen.getByLabelText("Model provider") as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "openclaw" } });
    switchToCharacterTab();
    expect(screen.getByText(/OpenClaw.*soul system/i)).toBeInTheDocument();
  });

  it("restores character fields when switching away from OpenClaw", () => {
    renderPanel();
    // Change provider in Settings tab, then verify Character tab reflects the change.
    const providerSelect = screen.getByLabelText("Model provider") as HTMLSelectElement;
    fireEvent.change(providerSelect, { target: { value: "openclaw" } });
    fireEvent.change(providerSelect, { target: { value: "openai" } });
    switchToCharacterTab();
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
    expect(screen.getByPlaceholderText("Type a message")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send" })).toBeInTheDocument();
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
});
