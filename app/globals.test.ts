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
    const scrollbarRule = cssRule(".openclaw-command-row code::-webkit-scrollbar");

    expect(rule).toContain("overflow-x: auto");
    expect(rule).toContain("white-space: nowrap");
    expect(rule).toContain("align-content: center");
    expect(rule).toContain("min-height: 36px");
    expect(rule).toContain("padding: 6px 8px");
    expect(rule).toContain("scrollbar-width: none");
    expect(rule).toContain("-ms-overflow-style: none");
    expect(rule).not.toContain("overflow-wrap: anywhere");
    expect(scrollbarRule).toContain("display: none");
  });

  it("stacks onboarding above the Looking Glass button", () => {
    const onboardingOverlayRule = cssRule(".onboarding-overlay");
    const lookingGlassButtonRule = cssRule("#VRButton");

    expect(onboardingOverlayRule).toContain("z-index: 1000");
    expect(lookingGlassButtonRule).toContain("z-index: 20");
  });
});
