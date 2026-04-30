import { beforeEach, describe, expect, it } from "vitest";
import {
  CHARACTER_CONFIG_KEY,
  clearCharacterConfig,
  loadCharacterConfig,
  saveCharacterConfig
} from "./characterConfig";

// Lightweight localStorage stub
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => {
    store[key] = value;
  },
  removeItem: (key: string) => {
    delete store[key];
  }
};
Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });

beforeEach(() => {
  for (const key of Object.keys(store)) delete store[key];
});

describe("loadCharacterConfig", () => {
  it("returns null when nothing is stored", () => {
    expect(loadCharacterConfig()).toBeNull();
  });

  it("returns null for corrupted JSON", () => {
    store[CHARACTER_CONFIG_KEY] = "not-json{{{";
    expect(loadCharacterConfig()).toBeNull();
  });

  it("returns null when version field is wrong", () => {
    store[CHARACTER_CONFIG_KEY] = JSON.stringify({
      version: 2,
      name: "Andi",
      pronouns: "THEY",
      personality: "warm",
      greeting: "Hello"
    });
    expect(loadCharacterConfig()).toBeNull();
  });

  it("returns null when name is missing", () => {
    store[CHARACTER_CONFIG_KEY] = JSON.stringify({
      version: 1,
      pronouns: "THEY",
      personality: "warm",
      greeting: "Hello"
    });
    expect(loadCharacterConfig()).toBeNull();
  });

  it("returns null when pronouns is not a valid value", () => {
    store[CHARACTER_CONFIG_KEY] = JSON.stringify({
      version: 1,
      name: "Andi",
      pronouns: "IT",
      personality: "warm",
      greeting: "Hello"
    });
    expect(loadCharacterConfig()).toBeNull();
  });
});

describe("saveCharacterConfig + loadCharacterConfig round-trip", () => {
  it("persists and restores all character fields", () => {
    saveCharacterConfig({
      name: "Nova",
      pronouns: "SHE",
      personality: "She is a helpful tutor.",
      greeting: "Hey there, ready to learn?"
    });

    const loaded = loadCharacterConfig();

    expect(loaded).not.toBeNull();
    expect(loaded!.version).toBe(1);
    expect(loaded!.name).toBe("Nova");
    expect(loaded!.pronouns).toBe("SHE");
    expect(loaded!.personality).toBe("She is a helpful tutor.");
    expect(loaded!.greeting).toBe("Hey there, ready to learn?");
  });

  it("persists all three pronoun values", () => {
    for (const pronouns of ["HE", "SHE", "THEY"] as const) {
      saveCharacterConfig({ name: "X", pronouns, personality: "p", greeting: "g" });
      expect(loadCharacterConfig()!.pronouns).toBe(pronouns);
    }
  });

  it("overwrites an existing entry on repeated saves", () => {
    saveCharacterConfig({ name: "Andi", pronouns: "THEY", personality: "original", greeting: "Hi" });
    saveCharacterConfig({ name: "Nova", pronouns: "SHE", personality: "updated", greeting: "Hello" });

    const loaded = loadCharacterConfig();

    expect(loaded!.name).toBe("Nova");
    expect(loaded!.personality).toBe("updated");
  });

  it("silently ignores localStorage failures without throwing", () => {
    const failing = {
      getItem: () => { throw new Error("storage unavailable"); },
      setItem: () => { throw new Error("storage unavailable"); },
      removeItem: () => { throw new Error("storage unavailable"); }
    };
    Object.defineProperty(globalThis, "localStorage", { value: failing, writable: true });

    expect(() =>
      saveCharacterConfig({ name: "X", pronouns: "HE", personality: "p", greeting: "g" })
    ).not.toThrow();
    expect(loadCharacterConfig()).toBeNull();
    expect(() => clearCharacterConfig()).not.toThrow();

    Object.defineProperty(globalThis, "localStorage", { value: localStorageMock, writable: true });
  });
});

describe("clearCharacterConfig", () => {
  it("removes the stored config so loadCharacterConfig returns null", () => {
    saveCharacterConfig({ name: "Andi", pronouns: "THEY", personality: "p", greeting: "g" });

    clearCharacterConfig();

    expect(loadCharacterConfig()).toBeNull();
  });

  it("does not throw when nothing was stored", () => {
    expect(() => clearCharacterConfig()).not.toThrow();
  });
});
