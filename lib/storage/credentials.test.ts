import { describe, expect, it } from "vitest";
import { createMemoryCredentialRepository } from "./memoryCredentialRepository";

describe("credential repository", () => {
  it("stores provider credentials in a browser-local repository contract", async () => {
    const repo = createMemoryCredentialRepository();

    const saved = await repo.save({
      providerId: "openai",
      label: "Personal key",
      kind: "api_key",
      encryptedValue: "encrypted-secret"
    });

    expect(saved.id).toBeTruthy();
    expect(saved.createdAt).toBe(saved.updatedAt);
    await expect(repo.list()).resolves.toHaveLength(1);
  });

  it("updates without changing provider identity", async () => {
    const repo = createMemoryCredentialRepository();
    const saved = await repo.save({
      providerId: "anthropic",
      label: "Claude",
      kind: "api_key",
      encryptedValue: "old"
    });

    const updated = await repo.update(saved.id, { label: "Claude API", encryptedValue: "new" });

    expect(updated).toMatchObject({
      id: saved.id,
      providerId: "anthropic",
      label: "Claude API",
      encryptedValue: "new"
    });
    expect(updated.updatedAt).not.toBe(saved.updatedAt);
  });
});
