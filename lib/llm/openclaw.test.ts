import { describe, expect, it } from "vitest";
import { buildOpenClawConnectPayload, buildOpenClawSendPayload, parseOpenClawMessage } from "./openclaw";

describe("OpenClaw gateway contract", () => {
  it("connects with operator role and requested scopes", () => {
    expect(buildOpenClawConnectPayload({ token: "secret" })).toEqual({
      id: 1,
      method: "connect",
      params: {
        role: "operator",
        scopes: ["chat:send", "sessions:read"],
        token: "secret"
      }
    });
  });

  it("sends chat turns without Liteforms persona injection by default", () => {
    const payload = buildOpenClawSendPayload({
      model: "openai/gpt-5.4",
      messages: [{ role: "user", content: "Hello" }]
    });

    expect(payload.method).toBe("chat.send");
    expect(JSON.stringify(payload)).not.toContain("Liteforms");
  });

  it("extracts session.message deltas until done", () => {
    expect(parseOpenClawMessage({ method: "session.message", params: { delta: "Hi" } })).toEqual({
      type: "delta",
      text: "Hi"
    });
    expect(parseOpenClawMessage({ method: "session.message", params: { done: true } })).toEqual({ type: "done" });
  });
});
