import { z } from "zod";

export type LocalAuthProviderId = "openai-codex" | "claude-cli";
export type LocalAuthMethod = "oauth" | "device-code" | "cli";

export type LocalAuthStatus = {
  provider: LocalAuthProviderId;
  authenticated: boolean;
  accountLabel?: string;
  expiresAt?: number;
  source?: string;
  message?: string;
};

export type LocalAuthLoginResult = LocalAuthStatus & {
  verificationUrl?: string;
  userCode?: string;
  expiresInMs?: number;
};

export const localAuthRequestSchema = z.object({
  provider: z.enum(["openai-codex", "claude-cli"]),
  baseUrl: z.string().trim().url(),
  method: z.enum(["oauth", "device-code", "cli"]).optional()
});

const localAuthStatusSchema = z.object({
  authenticated: z.boolean(),
  accountLabel: z.string().optional(),
  expiresAt: z.number().optional(),
  source: z.string().optional(),
  message: z.string().optional()
});

const localAuthLoginSchema = localAuthStatusSchema.extend({
  verificationUrl: z.string().url().optional(),
  userCode: z.string().optional(),
  expiresInMs: z.number().optional()
});

export function defaultLocalAuthMethod(provider: LocalAuthProviderId): LocalAuthMethod {
  return provider === "openai-codex" ? "device-code" : "cli";
}

export function getLocalAuthCopy(provider: LocalAuthProviderId) {
  if (provider === "openai-codex") {
    return {
      idle: "Sign in with ChatGPT using OpenAI Codex device authorization.",
      checking: "Checking OpenAI Codex sign-in...",
      login: "Sign in with ChatGPT",
      signedIn: "OpenAI Codex signed in",
      unavailable: "Start ChatGPT sign-in, then check again."
    };
  }
  return {
    idle: "Reuse your local Claude CLI login.",
    checking: "Checking Claude CLI sign-in...",
    login: "Check Claude CLI login",
    signedIn: "Claude CLI signed in",
    unavailable: "Run claude auth login, then check again."
  };
}

export async function fetchLocalAuthStatus(input: z.input<typeof localAuthRequestSchema>) {
  const request = localAuthRequestSchema.parse(input);
  const response = await fetch(`${trimSlash(request.baseUrl)}/auth/status`, {
    headers: { Accept: "application/json" }
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(readErrorMessage(body, `Local auth status failed with ${response.status}`));
  }
  return {
    provider: request.provider,
    ...localAuthStatusSchema.parse(body)
  } satisfies LocalAuthStatus;
}

export async function startLocalAuthLogin(input: z.input<typeof localAuthRequestSchema>) {
  const request = localAuthRequestSchema.parse(input);
  const response = await fetch(`${trimSlash(request.baseUrl)}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ provider: request.provider, method: request.method ?? defaultLocalAuthMethod(request.provider) })
  });
  const body = await readJson(response);
  if (!response.ok) {
    throw new Error(readErrorMessage(body, `Local auth login failed with ${response.status}`));
  }
  return {
    provider: request.provider,
    ...localAuthLoginSchema.parse(body)
  } satisfies LocalAuthLoginResult;
}

async function readJson(response: Response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return { message: text };
  }
}

function readErrorMessage(body: unknown, fallback: string) {
  if (body && typeof body === "object" && "error" in body && typeof body.error === "string") {
    return body.error;
  }
  if (body && typeof body === "object" && "message" in body && typeof body.message === "string") {
    return body.message;
  }
  return fallback;
}

function trimSlash(input: string) {
  return input.replace(/\/+$/, "");
}
