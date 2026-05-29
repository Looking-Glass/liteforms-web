import { describe, expect, it } from "vitest";
import { getNativeBridgeLibraryName, getNativeBridgePlatformDir, resolveNativeBridgeRuntime } from "./nativeBridgePaths";

describe("native Bridge path resolution", () => {
  it("maps supported Windows and macOS platforms", () => {
    expect(getNativeBridgePlatformDir("win32", "x64")).toBe("win32-x64");
    expect(getNativeBridgePlatformDir("darwin", "x64")).toBe("darwin-x64");
    expect(getNativeBridgePlatformDir("darwin", "arm64")).toBe("darwin-arm64");
    expect(getNativeBridgeLibraryName("win32")).toBe("bridge_inproc.dll");
    expect(getNativeBridgeLibraryName("darwin")).toBe("libbridge_inproc.dylib");
  });

  it("resolves the development native Bridge directory", () => {
    expect(
      resolveNativeBridgeRuntime({
        appPath: "C:\\repo\\liteforms-web",
        arch: "x64",
        env: {},
        isPackaged: false,
        platform: "win32",
        resourcesPath: "C:\\repo\\liteforms-web"
      })
    ).toEqual({
      supported: true,
      platformDir: "win32-x64",
      runtimeDir: "C:\\repo\\liteforms-web\\native\\bridge\\win32-x64",
      libraryPath: "C:\\repo\\liteforms-web\\native\\bridge\\win32-x64\\bridge_inproc.dll",
      libraryName: "bridge_inproc.dll",
      source: "bundled"
    });
  });

  it("resolves the packaged native Bridge directory under resources", () => {
    expect(
      resolveNativeBridgeRuntime({
        appPath: "C:\\Program Files\\Liteforms\\resources\\app.asar",
        arch: "x64",
        env: {},
        isPackaged: true,
        platform: "win32",
        resourcesPath: "C:\\Program Files\\Liteforms\\resources"
      })
    ).toEqual(
      expect.objectContaining({
        runtimeDir: "C:\\Program Files\\Liteforms\\resources\\bridge\\win32-x64",
        libraryPath: "C:\\Program Files\\Liteforms\\resources\\bridge\\win32-x64\\bridge_inproc.dll"
      })
    );
  });

  it("supports an override directory for local Bridge SDK testing", () => {
    expect(
      resolveNativeBridgeRuntime({
        appPath: "ignored",
        arch: "arm64",
        env: { LITEFORMS_NATIVE_BRIDGE_DIR: "/tmp/bridge" },
        isPackaged: false,
        platform: "darwin",
        resourcesPath: "ignored"
      })
    ).toEqual({
      supported: true,
      platformDir: "darwin-arm64",
      runtimeDir: "/tmp/bridge",
      libraryPath: "/tmp/bridge/libbridge_inproc.dylib",
      libraryName: "libbridge_inproc.dylib",
      source: "override"
    });
  });

  it("does not advertise Linux support yet", () => {
    expect(
      resolveNativeBridgeRuntime({
        appPath: "/repo",
        arch: "x64",
        env: {},
        isPackaged: false,
        platform: "linux",
        resourcesPath: "/repo"
      })
    ).toEqual({
      supported: false,
      reason: "Native Looking Glass Bridge is not configured for linux/x64."
    });
  });
});
