type KeyboardEventTarget = Pick<Window, "addEventListener" | "removeEventListener">;

const EDITABLE_INPUT_TYPES = new Set([
  "",
  "email",
  "number",
  "password",
  "search",
  "tel",
  "text",
  "url",
]);

export function installEditableKeyboardEventShield(target: KeyboardEventTarget): () => void {
  const shieldEditableTyping = (event: KeyboardEvent) => {
    if (!isPlainTextEntryEvent(event) || !isEditableTarget(event.target)) {
      return;
    }

    event.stopImmediatePropagation();
  };

  target.addEventListener("keydown", shieldEditableTyping, { capture: true });
  target.addEventListener("keypress", shieldEditableTyping, { capture: true });
  target.addEventListener("keyup", shieldEditableTyping, { capture: true });

  return () => {
    target.removeEventListener("keydown", shieldEditableTyping, { capture: true });
    target.removeEventListener("keypress", shieldEditableTyping, { capture: true });
    target.removeEventListener("keyup", shieldEditableTyping, { capture: true });
  };
}

function isPlainTextEntryEvent(event: KeyboardEvent): boolean {
  if (event.ctrlKey || event.altKey || event.metaKey) {
    return false;
  }

  return event.key.length === 1 || event.code.startsWith("Key") || event.code.startsWith("Digit");
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  if (target.isContentEditable) {
    return true;
  }

  if (target instanceof HTMLTextAreaElement) {
    return !target.disabled && !target.readOnly;
  }

  if (target instanceof HTMLInputElement) {
    return !target.disabled && !target.readOnly && EDITABLE_INPUT_TYPES.has(target.type);
  }

  return false;
}
