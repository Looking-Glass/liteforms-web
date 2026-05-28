import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createNextServerEnv, resolveStandaloneDir } from "./nextServer";

const require = createRequire(import.meta.url);

function readPackageJson() {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
}

async function loadNextConfig(electronBuild?: string) {
  vi.resetModules();
  if (electronBuild === undefined) {
    delete process.env.LITEFORMS_ELECTRON_BUILD;
  } else {
    process.env.LITEFORMS_ELECTRON_BUILD = electronBuild;
  }

  return (await import("../next.config.ts")).default;
}

describe("Electron build configuration", () => {
  afterEach(() => {
    delete process.env.LITEFORMS_ELECTRON_BUILD;
    vi.resetModules();
  });

  it("keeps the normal web build unchanged", async () => {
    const config = await loadNextConfig();

    expect(config.output).toBeUndefined();
  });

  it("uses a standalone Next output only for Electron builds", async () => {
    const config = await loadNextConfig("1");

    expect(config.output).toBe("standalone");
  });

  it("declares Electron entrypoints and build scripts", () => {
    const pkg = readPackageJson();

    expect(pkg.main).toBe("dist-electron/main.js");
    expect(pkg.scripts).toEqual(
      expect.objectContaining({
        "build:electron": expect.stringContaining("build:electron:next"),
        "build:electron:main": expect.stringContaining("electron/tsconfig.json"),
        "build:electron:next": expect.stringContaining("LITEFORMS_ELECTRON_BUILD=1"),
        "dist:electron": expect.stringContaining("electron-builder")
      })
    );
    expect(pkg.devDependencies).toEqual(
      expect.objectContaining({
        electron: expect.any(String),
        "electron-builder": expect.any(String)
      })
    );
  });

  it("packages the standalone Next server without local environment files", () => {
    const builderConfig = require("../electron-builder.config.cjs");

    expect(builderConfig).toEqual(
      expect.objectContaining({
        appId: "org.liteforms.web",
        productName: "Liteforms"
      })
    );
    expect(builderConfig.files).toEqual(
      expect.arrayContaining([
        "dist-electron/**",
        ".next/standalone/**",
        ".next/static/**",
        "public/**",
        "package.json",
        "!**/.env",
        "!**/.env.*",
        "!**/.env*.local"
      ])
    );
    expect(builderConfig.win).toEqual(
      expect.objectContaining({
        signAndEditExecutable: false
      })
    );
    expect(builderConfig.asarUnpack).toEqual(expect.arrayContaining([".next/standalone/**"]));
  });

  it("starts the packaged Next server without forwarding provider secrets from the shell", () => {
    const env = createNextServerEnv({
      baseEnv: {
        Path: "C:\\Windows\\System32",
        OPENAI_API_KEY: "test-openai-key",
        LITEFORMS_LLM_OPENAI_API_KEY: "test-liteforms-key"
      },
      port: 4173
    });

    expect(env).toEqual(
      expect.objectContaining({
        Path: "C:\\Windows\\System32",
        ELECTRON_RUN_AS_NODE: "1",
        HOSTNAME: "127.0.0.1",
        NEXT_TELEMETRY_DISABLED: "1",
        NODE_ENV: "production",
        PORT: "4173"
      })
    );
    expect(env.OPENAI_API_KEY).toBeUndefined();
    expect(env.LITEFORMS_LLM_OPENAI_API_KEY).toBeUndefined();
  });

  it("runs packaged Next from the real unpacked asar directory", () => {
    expect(
      resolveStandaloneDir({
        appPath: "C:\\Liteforms\\resources\\app.asar",
        isPackaged: true,
        resourcesPath: "C:\\Liteforms\\resources"
      })
    ).toBe("C:\\Liteforms\\resources\\app.asar.unpacked\\.next\\standalone");
    expect(
      resolveStandaloneDir({
        appPath: "C:\\repo\\liteforms-web",
        isPackaged: false,
        resourcesPath: "C:\\repo\\liteforms-web"
      })
    ).toBe("C:\\repo\\liteforms-web\\.next\\standalone");
  });
});
