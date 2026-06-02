import { describe, expect, it } from "vitest";
import { isExternalUrl, resolveWindowOpenRequest } from "./windowOpenPolicy";

const appOrigin = "http://127.0.0.1:4173";

describe("Electron window open policy", () => {
  it("allows blank app popups used by the Looking Glass WebXR window", () => {
    expect(resolveWindowOpenRequest({ url: "about:blank" }, appOrigin)).toEqual({
      response: { action: "allow" },
    });
  });

  it("allows same-origin app popups", () => {
    expect(resolveWindowOpenRequest({ url: `${appOrigin}/hologram` }, appOrigin)).toEqual({
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
