import type { HandlerDetails, WindowOpenHandlerResponse } from "electron";

export type WindowOpenDecision = {
  response: WindowOpenHandlerResponse;
  externalUrl?: string;
};

export function isAppWindowUrl(targetUrl: string, allowedOrigin: string) {
  if (targetUrl === "" || targetUrl === "about:blank") return true;

  try {
    return new URL(targetUrl).origin === allowedOrigin;
  } catch {
    return false;
  }
}

export function isExternalUrl(targetUrl: string, allowedOrigin: string) {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.origin === allowedOrigin) {
      return false;
    }
    return parsed.protocol === "https:" || parsed.protocol === "http:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

export function resolveWindowOpenRequest(
  details: Pick<HandlerDetails, "url">,
  allowedOrigin: string
): WindowOpenDecision {
  if (isAppWindowUrl(details.url, allowedOrigin)) {
    return { response: { action: "allow" } };
  }

  if (isExternalUrl(details.url, allowedOrigin)) {
    return {
      response: { action: "deny" },
      externalUrl: details.url,
    };
  }

  return { response: { action: "deny" } };
}
