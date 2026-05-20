// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installEditableKeyboardEventShield } from "./keyboardEventShield";

afterEach(() => {
  document.body.innerHTML = "";
});

describe("installEditableKeyboardEventShield", () => {
  it("keeps text input KeyE events away from later global shortcut listeners", () => {
    const cleanup = installEditableKeyboardEventShield(window);
    const globalShortcut = vi.fn((event: KeyboardEvent) => event.preventDefault());
    window.addEventListener("keydown", globalShortcut, { capture: true });

    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = new KeyboardEvent("keydown", {
      key: "e",
      code: "KeyE",
      bubbles: true,
      cancelable: true,
    });

    input.dispatchEvent(event);

    expect(globalShortcut).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(false);

    cleanup();
  });

  it("does not block non-editable keyboard shortcuts", () => {
    const cleanup = installEditableKeyboardEventShield(window);
    const globalShortcut = vi.fn();
    window.addEventListener("keydown", globalShortcut, { capture: true });

    document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "e", code: "KeyE", bubbles: true }));

    expect(globalShortcut).toHaveBeenCalledTimes(1);

    cleanup();
  });
});
