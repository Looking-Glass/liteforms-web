import { posix, win32 } from "node:path";

export type NativeBridgePathResolution =
  | {
      supported: true;
      platformDir: string;
      runtimeDir: string;
      libraryPath: string;
      libraryName: string;
      source: "bundled" | "override";
    }
  | {
      supported: false;
      reason: string;
    };

type ResolveNativeBridgeRuntimeInput = {
  appPath: string;
  arch: string;
  env?: Record<string, string | undefined>;
  isPackaged: boolean;
  platform: NodeJS.Platform;
  resourcesPath: string;
};

export function getNativeBridgePlatformDir(platform: NodeJS.Platform, arch: string) {
  if (platform === "win32" && arch === "x64") return "win32-x64";
  if (platform === "darwin" && arch === "x64") return "darwin-x64";
  if (platform === "darwin" && arch === "arm64") return "darwin-arm64";
  return undefined;
}

export function getNativeBridgeLibraryName(platform: NodeJS.Platform) {
  if (platform === "win32") return "bridge_inproc.dll";
  if (platform === "darwin") return "libbridge_inproc.dylib";
  return undefined;
}

export function resolveNativeBridgeRuntime({
  appPath,
  arch,
  env = process.env,
  isPackaged,
  platform,
  resourcesPath
}: ResolveNativeBridgeRuntimeInput): NativeBridgePathResolution {
  const libraryName = getNativeBridgeLibraryName(platform);
  const platformDir = getNativeBridgePlatformDir(platform, arch);
  const path = platform === "win32" ? win32 : posix;

  if (!libraryName || !platformDir) {
    return {
      supported: false,
      reason: `Native Looking Glass Bridge is not configured for ${platform}/${arch}.`
    };
  }

  const overrideDir = env.LITEFORMS_NATIVE_BRIDGE_DIR;
  if (overrideDir) {
    return {
      supported: true,
      platformDir,
      runtimeDir: overrideDir,
      libraryPath: path.join(overrideDir, libraryName),
      libraryName,
      source: "override"
    };
  }

  const runtimeRoot = isPackaged ? path.join(resourcesPath, "bridge") : path.join(appPath, "native", "bridge");
  const runtimeDir = path.join(runtimeRoot, platformDir);

  return {
    supported: true,
    platformDir,
    runtimeDir,
    libraryPath: path.join(runtimeDir, libraryName),
    libraryName,
    source: "bundled"
  };
}
