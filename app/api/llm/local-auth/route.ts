import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { resolveClaudeCliStatus } from "@/lib/llm/claudeCli";
import {
  pollOpenAiCodexDevicePairing,
  requestOpenAiCodexDevicePairing
} from "@/lib/llm/openAiCodexDeviceAuth";
import { getOpenAiCodexAuthStore } from "@/lib/llm/openAiCodexAuthStore";
import { fetchLocalAuthStatus, localAuthRequestSchema, startLocalAuthLogin } from "@/lib/llm/localAuth";

const localAuthProxyRequestSchema = localAuthRequestSchema.extend({
  action: z.enum(["status", "login"])
});

export async function POST(request: NextRequest) {
  try {
    const body = localAuthProxyRequestSchema.parse(await request.json());
    if (body.provider === "openai-codex") {
      return NextResponse.json(await handleOpenAiCodexAuth(body.action));
    }
    if (body.provider === "claude-cli") {
      return NextResponse.json(await handleClaudeCliAuth(body.action));
    }
    const result =
      body.action === "status"
        ? await fetchLocalAuthStatus(body)
        : await startLocalAuthLogin(body);
    return NextResponse.json(result);
  } catch (error) {
    if (isLocalHelperUnavailable(error)) {
      return NextResponse.json({
        authenticated: false,
        message:
          "Local auth helper is not running or does not expose /auth/status and /auth/login yet."
      });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Local auth request failed" },
      { status: 502 }
    );
  }
}

async function handleClaudeCliAuth(action: "status" | "login") {
  if (action === "login") {
    return {
      provider: "claude-cli" as const,
      authenticated: false,
      source: "Claude CLI",
      message: "Run claude auth login in a terminal. Liteforms will reuse that local Claude CLI login."
    };
  }
  return await resolveClaudeCliStatus();
}

async function handleOpenAiCodexAuth(action: "status" | "login") {
  const store = getOpenAiCodexAuthStore();
  if (action === "login") {
    const pending = await requestOpenAiCodexDevicePairing();
    store.pending = pending;
    return {
      provider: "openai-codex",
      authenticated: false,
      verificationUrl: pending.verificationUrl,
      userCode: pending.userCode,
      expiresInMs: pending.expiresInMs,
      message: `Open ${pending.verificationUrl} and enter code ${pending.userCode}.`
    };
  }

  if (store.credential && store.credential.expires > Date.now()) {
    return {
      provider: "openai-codex",
      authenticated: true,
      expiresAt: store.credential.expires,
      source: "OpenAI Codex device pairing"
    };
  }

  if (!store.pending) {
    return {
      provider: "openai-codex",
      authenticated: false,
      message: "Start ChatGPT sign-in first."
    };
  }

  const credential = await pollOpenAiCodexDevicePairing(store.pending);
  if (!credential) {
    return {
      provider: "openai-codex",
      authenticated: false,
      verificationUrl: store.pending.verificationUrl,
      userCode: store.pending.userCode,
      expiresInMs: Math.max(0, store.pending.expiresInMs - (Date.now() - store.pending.requestedAt)),
      message: `Waiting for ChatGPT sign-in. Enter code ${store.pending.userCode}.`
    };
  }

  store.credential = credential;
  store.pending = undefined;
  return {
    provider: "openai-codex",
    authenticated: true,
    expiresAt: credential.expires,
    source: "OpenAI Codex device pairing",
    message: "OpenAI Codex signed in."
  };
}

function isLocalHelperUnavailable(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    /fetch failed/i.test(message) ||
    /ECONNREFUSED/i.test(message) ||
    /ENOTFOUND/i.test(message) ||
    /Local auth (?:status|login) failed with 404/i.test(message)
  );
}
