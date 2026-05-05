import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const css = readFileSync("app/globals.css", "utf8");

function cssRule(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{(?<body>[^}]*)\\}`));
  return match?.groups?.body ?? "";
}

describe("global CSS", () => {
  it("keeps the OpenClaw setup command on one horizontally-scrollable line", () => {
    const rule = cssRule(".openclaw-command-row code");

    expect(rule).toContain("overflow-x: auto");
    expect(rule).toContain("white-space: nowrap");
    expect(rule).not.toContain("overflow-wrap: anywhere");
  });

  it("stacks onboarding above the Looking Glass button", () => {
    const onboardingOverlayRule = cssRule(".onboarding-overlay");
    const lookingGlassButtonRule = cssRule("#VRButton");

    expect(onboardingOverlayRule).toContain("z-index: 1000");
    expect(lookingGlassButtonRule).toContain("z-index: 20");
  });
});
