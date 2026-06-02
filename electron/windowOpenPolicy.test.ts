import { describe, expect, it } from "vitest";
import {
  hologramWindowBrowserOptions,
  isExternalUrl,
  resolveWindowOpenRequest,
} from "./windowOpenPolicy";

const appOrigin = "http://127.0.0.1:4173";

describe("Electron window open policy", () => {
  it("allows blank app popups used by the Looking Glass WebXR window", () => {
    expect(resolveWindowOpenRequest({ url: "about:blank" }, appOrigin)).toEqual({
      response: { action: "allow" },
    });
  });

  it("makes Looking Glass display popups borderless fullscreen windows", () => {
    expect(
      resolveWindowOpenRequest({
        url: "about:blank",
        frameName: "new",
        features:
          "left=1920,top=0,width=1440,height=2560,menubar=no,toolbar=no,fullscreenEnabled=true",
      }, appOrigin)
    ).toEqual({
      response: {
        action: "allow",
        overrideBrowserWindowOptions: hologramWindowBrowserOptions,
      },
    });
  });

  it("also treats the Liteforms HLD fallback popup as a borderless fullscreen window", () => {
    expect(
      resolveWindowOpenRequest({
        url: "about:blank",
        frameName: "liteforms-hld-hologram",
        features: "width=640,height=960",
      }, appOrigin)
    ).toEqual({
      response: {
        action: "allow",
        overrideBrowserWindowOptions: hologramWindowBrowserOptions,
      },
    });
  });

  it("allows same-origin app popups", () => {
    expect(resolveWindowOpenRequest({ url: `${appOrigin}/hologram` }, appOrigin)).toEqual({
      response: { action: "allow" },
    });
  });

  it("does not make same-origin app routes fullscreen from popup features alone", () => {
    expect(
      resolveWindowOpenRequest({
        url: `${appOrigin}/hologram`,
        frameName: "new",
        features: "fullscreenEnabled=true",
      }, appOrigin)
    ).toEqual({
      response: { action: "allow" },
    });
  });

  it("keeps external http links denied for Electron and opened by the OS shell", () => {
    expect(resolveWindowOpenRequest({ url: "https://example.com/login" }, appOrigin)).toEqual({
      response: { action: "deny" },
      externalUrl: "https://example.com/login",
    });
  });

  it("denies unsupported schemes", () => {
    expect(resolveWindowOpenRequest({ url: "javascript:alert(1)" }, appOrigin)).toEqual({
      response: { action: "deny" },
    });
  });
});

describe("isExternalUrl", () => {
  it("does not treat same-origin app URLs as external", () => {
    expect(isExternalUrl(`${appOrigin}/settings`, appOrigin)).toBe(false);
  });

  it("treats web and mail links outside the app origin as external", () => {
    expect(isExternalUrl("https://lookingglassfactory.com", appOrigin)).toBe(true);
    expect(isExternalUrl("mailto:support@example.com", appOrigin)).toBe(true);
  });
});
