import { getAuth0Client, hasAuth0Config } from "@/lib/auth0";
import { LiteformsApiClient } from "./client";

export async function getLiteformsAccessToken() {
  if (!hasAuth0Config()) {
    return undefined;
  }

  try {
    const auth0 = await getAuth0Client();
    if (!auth0) {
      return undefined;
    }

    const result = await auth0.getAccessToken();
    return result.token;
  } catch {
    return undefined;
  }
}

export function createServerLiteformsClient(accessToken: string) {
  const baseUrl = process.env.LITEFORMS_API_BASE_URL;

  if (!baseUrl) {
    throw new Error("LITEFORMS_API_BASE_URL is not configured");
  }

  return new LiteformsApiClient({ baseUrl, accessToken });
}
