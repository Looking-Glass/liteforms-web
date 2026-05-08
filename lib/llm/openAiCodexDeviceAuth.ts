const OPENAI_AUTH_BASE_URL = "https://auth.openai.com";
const OPENAI_CODEX_CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";
const OPENAI_CODEX_DEVICE_CODE_TIMEOUT_MS = 15 * 60_000;
const OPENAI_CODEX_DEVICE_CODE_DEFAULT_INTERVAL_MS = 5_000;
const OPENAI_CODEX_DEVICE_CODE_MIN_INTERVAL_MS = 1_000;
const OPENAI_CODEX_DEVICE_CALLBACK_URL = `${OPENAI_AUTH_BASE_URL}/deviceauth/callback`;

export type OpenAiCodexDevicePrompt = {
  verificationUrl: string;
  userCode: string;
  expiresInMs: number;
};

export type OpenAiCodexDeviceCredential = {
  access: string;
  refresh: string;
  expires: number;
};

export type OpenAiCodexDevicePending = OpenAiCodexDevicePrompt & {
  deviceAuthId: string;
  intervalMs: number;
  requestedAt: number;
};

type DeviceCodeUserCodePayload = {
  device_auth_id?: unknown;
  user_code?: unknown;
  usercode?: unknown;
  interval?: unknown;
};

type DeviceCodeTokenPayload = {
  authorization_code?: unknown;
  code_verifier?: unknown;
};

type OAuthTokenPayload = {
  access_token?: unknown;
  refresh_token?: unknown;
  expires_in?: unknown;
};

type DeviceCodeAuthorizationCode = {
  authorizationCode: string;
  codeVerifier: string;
};

export async function requestOpenAiCodexDevicePairing(fetchFn: typeof fetch = fetch): Promise<OpenAiCodexDevicePending> {
  const response = await fetchFn(`${OPENAI_AUTH_BASE_URL}/api/accounts/deviceauth/usercode`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: OPENAI_CODEX_CLIENT_ID })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("OpenAI Codex device code login is not enabled for this server.");
    }
    throw new Error(formatDeviceCodeError("OpenAI device code request failed", response.status, bodyText));
  }

  const body = parseJsonObject(bodyText) as DeviceCodeUserCodePayload | null;
  const deviceAuthId = trimNonEmptyString(body?.device_auth_id);
  const userCode = trimNonEmptyString(body?.user_code) ?? trimNonEmptyString(body?.usercode);
  if (!deviceAuthId || !userCode) {
    throw new Error("OpenAI device code response was missing the device code or user code.");
  }

  return {
    deviceAuthId,
    userCode,
    verificationUrl: `${OPENAI_AUTH_BASE_URL}/codex/device`,
    expiresInMs: OPENAI_CODEX_DEVICE_CODE_TIMEOUT_MS,
    intervalMs: normalizePositiveMilliseconds(body?.interval) ?? OPENAI_CODEX_DEVICE_CODE_DEFAULT_INTERVAL_MS,
    requestedAt: Date.now()
  };
}

export async function pollOpenAiCodexDevicePairing(
  pending: OpenAiCodexDevicePending,
  fetchFn: typeof fetch = fetch
): Promise<OpenAiCodexDeviceCredential | null> {
  if (Date.now() - pending.requestedAt > pending.expiresInMs) {
    throw new Error("OpenAI device authorization timed out. Start sign-in again.");
  }

  const authorization = await pollOpenAiCodexAuthorizationCode(pending, fetchFn);
  if (!authorization) {
    return null;
  }
  return await exchangeOpenAiCodexDeviceCode(authorization, fetchFn);
}

export async function refreshOpenAiCodexCredential(
  refreshToken: string,
  fetchFn: typeof fetch = fetch
): Promise<OpenAiCodexDeviceCredential> {
  const response = await fetchFn(`${OPENAI_AUTH_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: OPENAI_CODEX_CLIENT_ID
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(formatDeviceCodeError("OpenAI device token refresh failed", response.status, bodyText));
  }

  const body = parseJsonObject(bodyText) as OAuthTokenPayload | null;
  const access = trimNonEmptyString(body?.access_token);
  if (!access) {
    throw new Error("OpenAI token refresh succeeded but did not return an access token.");
  }

  const expiresInMs = normalizeTokenLifetimeMs(body?.expires_in);
  return {
    access,
    refresh: trimNonEmptyString(body?.refresh_token) ?? refreshToken,
    expires: Date.now() + (expiresInMs ?? 0)
  };
}

async function pollOpenAiCodexAuthorizationCode(
  pending: OpenAiCodexDevicePending,
  fetchFn: typeof fetch
): Promise<DeviceCodeAuthorizationCode | null> {
  const response = await fetchFn(`${OPENAI_AUTH_BASE_URL}/api/accounts/deviceauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      device_auth_id: pending.deviceAuthId,
      user_code: pending.userCode
    })
  });

  const bodyText = await response.text();
  if (response.ok) {
    const body = parseJsonObject(bodyText) as DeviceCodeTokenPayload | null;
    const authorizationCode = trimNonEmptyString(body?.authorization_code);
    const codeVerifier = trimNonEmptyString(body?.code_verifier);
    if (!authorizationCode || !codeVerifier) {
      throw new Error("OpenAI device authorization response was missing the exchange code.");
    }
    return { authorizationCode, codeVerifier };
  }

  if (response.status === 403 || response.status === 404) {
    return null;
  }

  throw new Error(formatDeviceCodeError("OpenAI device authorization failed", response.status, bodyText));
}

async function exchangeOpenAiCodexDeviceCode(
  authorization: DeviceCodeAuthorizationCode,
  fetchFn: typeof fetch
): Promise<OpenAiCodexDeviceCredential> {
  const response = await fetchFn(`${OPENAI_AUTH_BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: authorization.authorizationCode,
      redirect_uri: OPENAI_CODEX_DEVICE_CALLBACK_URL,
      client_id: OPENAI_CODEX_CLIENT_ID,
      code_verifier: authorization.codeVerifier
    })
  });

  const bodyText = await response.text();
  if (!response.ok) {
    throw new Error(formatDeviceCodeError("OpenAI device token exchange failed", response.status, bodyText));
  }

  const body = parseJsonObject(bodyText) as OAuthTokenPayload | null;
  const access = trimNonEmptyString(body?.access_token);
  const refresh = trimNonEmptyString(body?.refresh_token);
  if (!access || !refresh) {
    throw new Error("OpenAI token exchange succeeded but did not return OAuth tokens.");
  }

  const expiresInMs = normalizeTokenLifetimeMs(body?.expires_in);
  return {
    access,
    refresh,
    expires: Date.now() + (expiresInMs ?? 0)
  };
}

function normalizePositiveMilliseconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value * 1000);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10) * 1000;
  return undefined;
}

function normalizeTokenLifetimeMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return Math.trunc(value * 1000);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number.parseInt(value.trim(), 10) * 1000;
  return undefined;
}

function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function formatDeviceCodeError(prefix: string, status: number, bodyText: string): string {
  const body = parseJsonObject(bodyText);
  const error = trimNonEmptyString(body?.error);
  const description = trimNonEmptyString(body?.error_description);
  if (error && description) return `${prefix}: ${error} (${description})`;
  if (error) return `${prefix}: ${error}`;
  return bodyText ? `${prefix}: HTTP ${status} ${bodyText}` : `${prefix}: HTTP ${status}`;
}

function trimNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
