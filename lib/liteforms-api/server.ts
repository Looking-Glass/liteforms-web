import { LiteformsApiClient } from "./client";

export async function getLiteformsAccessToken() {
  return process.env.LITEFORMS_API_ACCESS_TOKEN?.trim() || undefined;
}

export function createServerLiteformsClient(accessToken: string) {
  const baseUrl = process.env.LITEFORMS_API_BASE_URL;

  if (!baseUrl) {
    throw new Error("LITEFORMS_API_BASE_URL is not configured");
  }

  return new LiteformsApiClient({ baseUrl, accessToken });
}
