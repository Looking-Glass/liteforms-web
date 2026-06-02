import type { BrowserWindowConstructorOptions, HandlerDetails, WindowOpenHandlerResponse } from "electron";

export const liteformsHldHologramWindowName = "liteforms-hld-hologram";

export const hologramWindowBrowserOptions: BrowserWindowConstructorOptions = {
  autoHideMenuBar: true,
  backgroundColor: "#000000",
  frame: false,
  fullscreen: true,
  fullscreenable: true,
  hasShadow: false,
  roundedCorners: false,
  title: "Liteforms Hologram",
  useContentSize: true,
};

export type WindowOpenDecision = {
  response: WindowOpenHandlerResponse;
  externalUrl?: string;
};

type WindowOpenRequestDetails =
  & Pick<HandlerDetails, "url">
  & Partial<Pick<HandlerDetails, "features" | "frameName">>;

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
  details: WindowOpenRequestDetails,
  allowedOrigin: string
): WindowOpenDecision {
  if (isAppWindowUrl(details.url, allowedOrigin)) {
    return {
      response: {
        action: "allow",
        ...(isHologramWindowOpenRequest(details) ? {
          overrideBrowserWindowOptions: hologramWindowBrowserOptions,
        } : {}),
      },
    };
  }

  if (isExternalUrl(details.url, allowedOrigin)) {
    return {
      response: { action: "deny" },
      externalUrl: details.url,
    };
  }

  return { response: { action: "deny" } };
}

export function isHologramWindowOpenRequest(details: WindowOpenRequestDetails) {
  if (!isBlankWindowUrl(details.url)) return false;

  return details.frameName === liteformsHldHologramWindowName
    || hasWindowFeature(details.features, "fullscreenEnabled", "true");
}

function isBlankWindowUrl(targetUrl: string) {
  return targetUrl === "" || targetUrl === "about:blank";
}

function hasWindowFeature(features: string | undefined, name: string, expectedValue: string) {
  if (!features) return false;

  return features.split(",").some((feature) => {
    const [rawName, rawValue = ""] = feature.split("=", 2);
    return rawName.trim().toLowerCase() === name.toLowerCase()
      && rawValue.trim().toLowerCase() === expectedValue.toLowerCase();
  });
}
