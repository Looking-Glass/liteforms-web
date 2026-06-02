import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createForwardedShellEnv, createNextServerEnv, resolveStandaloneDir } from "./nextServer";

const require = createRequire(import.meta.url);

function readPackageJson() {
  return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
}

function readElectronWorkflow() {
  return readFileSync(new URL("../.github/workflows/build-electron.yml", import.meta.url), "utf8");
}

function readBuilderConfig() {
  const configPath = require.resolve("../electron-builder.config.cjs");
  delete require.cache[configPath];
  return require(configPath);
}

function clearAzureTrustedSigningEnv() {
  delete process.env.AZURE_TENANT_ID;
  delete process.env.AZURE_CLIENT_ID;
  delete process.env.AZURE_CLIENT_SECRET;
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
    delete process.env.LITEFORMS_ELECTRON_BUILDER_PLATFORM;
    clearAzureTrustedSigningEnv();
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
    expect(pkg.dependencies).toEqual(
      expect.objectContaining({
        koffi: expect.any(String)
      })
    );
  });

  it("packages the standalone Next server without local environment files", () => {
    clearAzureTrustedSigningEnv();
    const builderConfig = readBuilderConfig();

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
        "node_modules/@koromix/koffi-*/**",
        "node_modules/koffi/**",
        "native/bridge/*.md",
        "native/bridge/*.txt",
        "public/**",
        "package.json",
        "!**/.env",
        "!**/.env.*",
        "!**/.env*.local",
        "!**/node_modules/**/prebuilds/darwin*/**",
        "!**/node_modules/**/prebuilds/linux*/**",
        "!**/node_modules/**/prebuilds/win32-ia32/**",
        "!**/node_modules/**/prebuilds/win32-arm64/**",
        "!**/node_modules/**/bin/napi-*/darwin/**",
        "!**/node_modules/**/bin/napi-*/linux/**",
        "!**/node_modules/**/bin/napi-*/win32/ia32/**",
        "!**/node_modules/**/bin/napi-*/win32/arm64/**"
      ])
    );
    expect(builderConfig.win).toEqual(
      expect.objectContaining({
        signExts: [".dll", ".node"],
        signAndEditExecutable: false
      })
    );
    expect(builderConfig.win.files).toBeUndefined();
    expect(builderConfig.mac).toEqual(
      expect.objectContaining({
        hardenedRuntime: true,
        gatekeeperAssess: false,
        notarize: false
      })
    );
    expect(builderConfig.mac.files).toBeUndefined();
    expect(builderConfig.asarUnpack).toEqual(
      expect.arrayContaining([".next/standalone/**", "node_modules/@koromix/koffi-*/**", "node_modules/koffi/**"])
    );
    expect(builderConfig.extraResources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          from: "native/bridge/win32-x64",
          to: "bridge/win32-x64"
        })
      ])
    );
    expect(builderConfig.linux).toBeUndefined();
  });

  it("switches native binary excludes for macOS packages without broad platform file globs", () => {
    clearAzureTrustedSigningEnv();
    process.env.LITEFORMS_ELECTRON_BUILDER_PLATFORM = "darwin";
    const builderConfig = readBuilderConfig();

    expect(builderConfig.files).toEqual(
      expect.arrayContaining([
        "!**/node_modules/**/prebuilds/linux*/**",
        "!**/node_modules/**/prebuilds/win32*/**",
        "!**/node_modules/**/bin/napi-*/linux/**",
        "!**/node_modules/**/bin/napi-*/win32/**"
      ])
    );
    expect(builderConfig.files).not.toEqual(expect.arrayContaining(["!**/node_modules/**/prebuilds/darwin*/**"]));
    expect(builderConfig.win.files).toBeUndefined();
    expect(builderConfig.mac.files).toBeUndefined();
  });

  it("enables Azure Trusted Signing when CI credentials are present", () => {
    clearAzureTrustedSigningEnv();
    process.env.AZURE_TENANT_ID = "tenant-id";
    process.env.AZURE_CLIENT_ID = "client-id";
    process.env.AZURE_CLIENT_SECRET = "client-secret";

    const builderConfig = readBuilderConfig();

    expect(builderConfig.win).toEqual(
      expect.objectContaining({
        azureSignOptions: expect.objectContaining({
          endpoint: "https://eus.codesigning.azure.net/",
          certificateProfileName: "lkg-app",
          codeSigningAccountName: "lookingglassfactory",
          publisherName: "Looking Glass Factory Inc."
        })
      })
    );
    expect(builderConfig.win.signAndEditExecutable).toBeUndefined();
  });

  it("builds and uploads Electron releases from version tags", () => {
    const workflow = readElectronWorkflow();

    expect(workflow).toContain('name: Build Electron App');
    expect(workflow).toContain('"v[0-9]*.[0-9]*.[0-9]*"');
    expect(workflow).toContain("valid v-prefixed SemVer release tag");
    expect(workflow).toContain("persist-credentials: false");
    expect(workflow).not.toContain("GH_TOKEN:");
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("contents: write");
    expect(workflow).toContain("npm ci");
    expect(workflow).toContain("npm run build:electron");
    expect(workflow).toContain("APPLE_DEVELOPER_APPLICATION_CERT_BASE64");
    expect(workflow).toContain("APPLE_APP_SPECIFIC_PASSWORD");
    expect(workflow).toContain("xcrun notarytool submit");
    expect(workflow).toContain("xcrun stapler staple");
    expect(workflow).toContain("xcrun stapler validate");
    expect(workflow).not.toContain("context:primary-signature");
    expect(workflow).toContain("AZURE_TENANT_ID");
    expect(workflow).toContain("AZURE_CLIENT_SECRET");
    expect(workflow).toContain("needs: build");
    expect(workflow).toContain("actions/download-artifact@v4");
    expect(workflow).toContain("softprops/action-gh-release@v2");
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

  it("uses a shared child-process env allowlist for native helpers", () => {
    const env = createForwardedShellEnv({
      Path: "C:\\Windows\\System32",
      USERPROFILE: "C:\\Users\\Liteforms",
      OPENAI_API_KEY: "test-openai-key",
      LITEFORMS_LLM_OPENAI_API_KEY: "test-liteforms-key"
    });

    expect(env).toEqual(
      expect.objectContaining({
        Path: "C:\\Windows\\System32",
        USERPROFILE: "C:\\Users\\Liteforms"
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
