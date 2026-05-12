// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { CredentialSettingsPanel } from "./CredentialSettingsPanel";

// Stub out the IndexedDB repository so tests don't touch real storage
vi.mock("@/lib/storage/indexedDbCredentialRepository", () => ({
  createIndexedDbCredentialRepository: vi.fn(async () => ({
    list: vi.fn(async () => []),
    save: vi.fn(async () => {})
  }))
}));

afterEach(cleanup);

describe("CredentialSettingsPanel provider dropdown", () => {
  it("renders a provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.getByRole("combobox", { name: /provider/i })).toBeInTheDocument();
  });

  // ── LLM providers that need credentials ──────────────────────────────────

  it("includes OpenAI in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.getByRole("option", { name: /openai/i })).toBeInTheDocument();
  });

  it("includes Anthropic in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.getByRole("option", { name: /anthropic/i })).toBeInTheDocument();
  });

  it("includes Google AI Studio in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.getByRole("option", { name: /google ai studio/i })).toBeInTheDocument();
  });

  it("includes OpenRouter in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.getByRole("option", { name: /openrouter/i })).toBeInTheDocument();
  });

  it("does not include untested cloud LLM providers in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    for (const name of [/xai/i, /mistral/i, /cerebras/i, /nvidia/i, /groq/i, /together/i, /fireworks/i, /qwen/i]) {
      expect(screen.queryByRole("option", { name })).not.toBeInTheDocument();
    }
  });

  // ── Speech providers (non-LLM) stay in the list ──────────────────────────

  it("includes ElevenLabs in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.getByRole("option", { name: /elevenlabs/i })).toBeInTheDocument();
  });

  it("includes Deepgram in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.getByRole("option", { name: /deepgram/i })).toBeInTheDocument();
  });

  // ── Local providers must NOT appear (they don't use credentials) ──────────

  it("does not include Ollama in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.queryByRole("option", { name: /^ollama$/i })).not.toBeInTheDocument();
  });

  it("does not include LM Studio in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.queryByRole("option", { name: /lm studio/i })).not.toBeInTheDocument();
  });

  it("does not include Gemma in browser in the provider dropdown", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.queryByRole("option", { name: /gemma in browser/i })).not.toBeInTheDocument();
  });

  it("does not include OpenAI Codex because it uses local auth", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.queryByRole("option", { name: /openai codex/i })).not.toBeInTheDocument();
  });

  it("does not include Claude CLI because it reuses local auth", () => {
    render(<CredentialSettingsPanel />);
    expect(screen.queryByRole("option", { name: /claude cli/i })).not.toBeInTheDocument();
  });
});
