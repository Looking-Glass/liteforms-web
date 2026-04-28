import type { Auth0Client } from "@auth0/nextjs-auth0/server";

let auth0Client: Auth0Client | undefined;

export function hasAuth0Config() {
  return Boolean(
    process.env.AUTH0_DOMAIN &&
      process.env.AUTH0_CLIENT_ID &&
      process.env.AUTH0_CLIENT_SECRET &&
      process.env.AUTH0_SECRET
  );
}

export async function getAuth0Client() {
  if (!hasAuth0Config()) {
    return undefined;
  }

  if (!auth0Client) {
    const { Auth0Client } = await import("@auth0/nextjs-auth0/server");
    auth0Client = new Auth0Client({
      authorizationParameters: {
        audience: process.env.AUTH0_AUDIENCE
      }
    });
  }

  return auth0Client;
}
