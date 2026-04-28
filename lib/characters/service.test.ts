import { describe, expect, it, vi } from "vitest";
import { createCharacterService } from "./service";

describe("character service", () => {
  it("requires authentication before creating custom characters", async () => {
    const service = createCharacterService({
      getAccessToken: async () => undefined,
      createClient: vi.fn()
    });

    await expect(
      service.createCharacter({
        name: "Ada",
        description: "A precise helper",
        pronouns: "THEY",
        sceneId: "default",
        voice: {}
      })
    ).rejects.toThrow("Authentication required");
  });

  it("proxies create/update/delete to the Liteforms API with validated input", async () => {
    const api = {
      createCharacter: vi.fn(async (body) => ({ id: 1, ...body })),
      updateCharacter: vi.fn(async (id, body) => ({
        id,
        name: body.name ?? "Ada",
        description: body.description ?? "A precise helper",
        pronouns: body.pronouns ?? "THEY",
        sceneId: body.sceneId ?? "default",
        voice: body.voice ?? {}
      })),
      deleteCharacter: vi.fn(async () => ({ ok: true as const })),
      getCharacters: vi.fn(async () => [])
    };
    const service = createCharacterService({
      getAccessToken: async () => "token",
      createClient: () => api
    });

    await service.createCharacter({
      name: "Ada",
      description: "A precise helper",
      pronouns: "THEY",
      sceneId: "",
      voice: {}
    });
    await service.updateCharacter(1, { name: "Ada Lovelace" });
    await service.deleteCharacter(1);

    expect(api.createCharacter).toHaveBeenCalledWith({
      name: "Ada",
      description: "A precise helper",
      pronouns: "THEY",
      sceneId: "default",
      voice: {}
    });
    expect(api.updateCharacter).toHaveBeenCalledWith(1, { name: "Ada Lovelace" });
    expect(api.deleteCharacter).toHaveBeenCalledWith(1);
  });
});
