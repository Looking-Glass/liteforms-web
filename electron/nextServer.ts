import http from "node:http";
import net from "node:net";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export type EnvMap = Record<string, string | undefined>;
type NextServerEnv = Record<string, string> & {
  ELECTRON_RUN_AS_NODE: "1";
  HOSTNAME: "127.0.0.1";
  NEXT_TELEMETRY_DISABLED: "1";
  NODE_ENV: "production";
  PORT: string;
};

export function resolveStandaloneDir({
  appPath,
  isPackaged,
  resourcesPath
}: {
  appPath: string;
  isPackaged: boolean;
  resourcesPath: string;
}) {
  if (isPackaged) {
    return join(resourcesPath, "app.asar.unpacked", ".next", "standalone");
  }

  return join(appPath, ".next", "standalone");
}

const FORWARDED_ENV_KEYS = [
  "APPDATA",
  "ComSpec",
  "HOME",
  "LANG",
  "LC_ALL",
  "LOCALAPPDATA",
  "PATH",
  "PATHEXT",
  "Path",
  "SystemRoot",
  "TEMP",
  "TMP",
  "USERPROFILE",
  "WINDIR",
  "XDG_CACHE_HOME",
  "XDG_CONFIG_HOME",
  "XDG_DATA_HOME"
];

export function createForwardedShellEnv(baseEnv: EnvMap = process.env) {
  const env: Record<string, string> = {};

  for (const key of FORWARDED_ENV_KEYS) {
    const value = baseEnv[key];
    if (value) {
      env[key] = value;
    }
  }

  return env;
}

export function createNextServerEnv({ baseEnv = process.env, port }: { baseEnv?: EnvMap; port: number }): NextServerEnv {
  return {
    ...createForwardedShellEnv(baseEnv),
    ELECTRON_RUN_AS_NODE: "1",
    HOSTNAME: "127.0.0.1",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_ENV: "production",
    PORT: String(port)
  };
}

export async function getAvailablePort(hostname = "127.0.0.1") {
  return await new Promise<number>((resolve, reject) => {
    const server = net.createServer();

    server.unref();
    server.on("error", reject);
    server.listen(0, hostname, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === "object" && address?.port) {
          resolve(address.port);
          return;
        }
        reject(new Error("Could not resolve an available local port for the Electron Next server."));
      });
    });
  });
}

export async function waitForHttpServer(url: string, timeoutMs = 30000) {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await probeHttpServer(url);
      return;
    } catch (error) {
      lastError = error;
      await delay(250);
    }
  }

  const detail = lastError instanceof Error ? ` Last error: ${lastError.message}` : "";
  throw new Error(`Timed out waiting for the packaged Next server at ${url}.${detail}`);
}

function probeHttpServer(url: string) {
  return new Promise<void>((resolve, reject) => {
    const request = http.get(url, (response) => {
      response.resume();
      resolve();
    });

    request.setTimeout(2000, () => {
      request.destroy(new Error("HTTP probe timed out."));
    });
    request.on("error", reject);
  });
}
