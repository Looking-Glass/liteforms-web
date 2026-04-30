import { describe, expect, it } from "vitest";
import { createMemoryVrmRepository } from "./memoryVrmRepository";

function makeBuffer(content: string): ArrayBuffer {
  return new TextEncoder().encode(content).buffer as ArrayBuffer;
}

describe("VrmRepository — memory implementation", () => {
  it("returns null when nothing has been stored", async () => {
    const repo = createMemoryVrmRepository();
    await expect(repo.load()).resolves.toBeNull();
  });

  it("stores and retrieves a VRM buffer with its filename", async () => {
    const repo = createMemoryVrmRepository();
    const buf = makeBuffer("fake-vrm-bytes");

    await repo.save(buf, "my-avatar.vrm");

    const loaded = await repo.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.fileName).toBe("my-avatar.vrm");
    expect(loaded!.arrayBuffer).toBe(buf);
  });

  it("overwrites a previous VRM when saved again", async () => {
    const repo = createMemoryVrmRepository();

    await repo.save(makeBuffer("first"), "first.vrm");
    await repo.save(makeBuffer("second"), "second.vrm");

    const loaded = await repo.load();
    expect(loaded!.fileName).toBe("second.vrm");
  });

  it("returns null after clear", async () => {
    const repo = createMemoryVrmRepository();
    await repo.save(makeBuffer("bytes"), "avatar.vrm");

    await repo.clear();

    await expect(repo.load()).resolves.toBeNull();
  });

  it("does not throw when clearing an empty repository", async () => {
    const repo = createMemoryVrmRepository();
    await expect(repo.clear()).resolves.not.toThrow();
  });
});
