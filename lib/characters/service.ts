import type { LiteformsApiClient } from "@/lib/liteforms-api/client";
import type { CreateCharacterBody, UpdateCharacterBody } from "@/lib/liteforms-api/types";
import { normalizeCharacterInput, normalizeCharacterUpdate } from "./schema";

type CharacterApi = Pick<
  LiteformsApiClient,
  "getCharacters" | "createCharacter" | "updateCharacter" | "deleteCharacter"
>;

type CharacterServiceOptions = {
  getAccessToken: () => Promise<string | undefined>;
  createClient: (accessToken: string) => CharacterApi;
};

export function createCharacterService(options: CharacterServiceOptions) {
  async function authenticatedApi() {
    const accessToken = await options.getAccessToken();

    if (!accessToken) {
      throw new AuthenticationRequiredError();
    }

    return options.createClient(accessToken);
  }

  return {
    async listCharacters() {
      const api = await authenticatedApi();
      return api.getCharacters();
    },
    async createCharacter(input: unknown) {
      const api = await authenticatedApi();
      return api.createCharacter(normalizeCharacterInput(input) satisfies CreateCharacterBody);
    },
    async updateCharacter(id: number, input: unknown) {
      const api = await authenticatedApi();
      return api.updateCharacter(id, normalizeCharacterUpdate(input) satisfies UpdateCharacterBody);
    },
    async deleteCharacter(id: number) {
      const api = await authenticatedApi();
      return api.deleteCharacter(id);
    }
  };
}

export class AuthenticationRequiredError extends Error {
  constructor() {
    super("Authentication required");
  }
}
