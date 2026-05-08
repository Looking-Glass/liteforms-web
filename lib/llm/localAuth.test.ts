import { afterEach, describe, expect, it, vi } from "vitest";
import { defaultLocalAuthMethod, fetchLocalAuthStatus, getLocalAuthCopy, startLocalAuthLogin } from "./localAuth";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("local provider auth", () => {
  it("uses OpenClaw-compatible auth methods for subscription providers", () => {
    expect(defaultLocalAuthMethod("openai-codex")).toBe("device-code");
    expect(defaultLocalAuthMethod("claude-cli")).toBe("cli");
  });

  it("describes OpenAI Codex as browser login rather than API key entry", () => {
    expect(getLocalAuthCopy("openai-codex").login).toMatch(/chatgpt/i);
    expect(getLocalAuthCopy("openai-codex").idle).toMatch(/device authorization/i);
    expect(getLocalAuthCopy("openai-codex").idle).not.toMatch(/api key/i);
    expect(getLocalAuthCopy("openai-codex").idle).not.toMatch(/helper/i);
  });

  it("fetches status from the configured local helper", async () => {
    const fetchMock = vi.fn(async () => Response.json({ authenticated: true, accountLabel: "user@example.com" }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchLocalAuthStatus({
      provider: "claude-cli",
      baseUrl: "http://127.0.0.1:1456"
    })).resolves.toMatchObject({
      provider: "claude-cli",
      authenticated: true,
      accountLabel: "user@example.com"
    });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:1456/auth/status", expect.any(Object));
  });

  it("starts login with the provider's OpenClaw-compatible method", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      authenticated: false,
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH",
      expiresInMs: 900000
    }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(startLocalAuthLogin({
      provider: "claude-cli",
      baseUrl: "http://127.0.0.1:1456"
    })).resolves.toMatchObject({
      provider: "claude-cli",
      verificationUrl: "https://auth.openai.com/codex/device",
      userCode: "ABCD-EFGH"
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:1456/auth/login",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ provider: "claude-cli", method: "cli" })
      })
    );
  });
});
