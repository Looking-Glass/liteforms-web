import { createServerLiteformsClient, getLiteformsAccessToken } from "@/lib/liteforms-api/server";
import { createCharacterService } from "./service";

export const serverCharacterService = createCharacterService({
  getAccessToken: getLiteformsAccessToken,
  createClient: createServerLiteformsClient
});
