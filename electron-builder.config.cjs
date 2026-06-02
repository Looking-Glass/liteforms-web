/** @type {import("electron-builder").Configuration} */
const { existsSync } = module.require("node:fs");

const hasAzureTrustedSigningEnv = Boolean(
  process.env.AZURE_TENANT_ID && process.env.AZURE_CLIENT_ID && process.env.AZURE_CLIENT_SECRET
);

const windowsSigningConfig = hasAzureTrustedSigningEnv
  ? {
      azureSignOptions: {
        endpoint: "https://eus.codesigning.azure.net/",
        certificateProfileName: "lkg-app",
        codeSigningAccountName: "lookingglassfactory",
        publisherName: "Looking Glass Factory Inc."
      }
    }
  : {
      signAndEditExecutable: false
    };

const nativeBridgeResources = [
  { from: "native/bridge/win32-x64", to: "bridge/win32-x64", filter: ["**/*"] },
  { from: "native/bridge/darwin-x64", to: "bridge/darwin-x64", filter: ["**/*"] },
  { from: "native/bridge/darwin-arm64", to: "bridge/darwin-arm64", filter: ["**/*"] }
].filter(({ from }) => existsSync(from));

// Do not package cross-platform native addons; Windows signing rejects non-PE .node files.
const windowsNativeBinaryExcludes = [
  "!**/node_modules/**/prebuilds/darwin*/**",
  "!**/node_modules/**/prebuilds/linux*/**",
  "!**/node_modules/**/prebuilds/win32-ia32/**",
  "!**/node_modules/**/prebuilds/win32-arm64/**",
  "!**/node_modules/**/bin/napi-*/darwin/**",
  "!**/node_modules/**/bin/napi-*/linux/**",
  "!**/node_modules/**/bin/napi-*/win32/ia32/**",
  "!**/node_modules/**/bin/napi-*/win32/arm64/**"
];

const macNativeBinaryExcludes = [
  "!**/node_modules/**/prebuilds/linux*/**",
  "!**/node_modules/**/prebuilds/win32*/**",
  "!**/node_modules/**/bin/napi-*/linux/**",
  "!**/node_modules/**/bin/napi-*/win32/**"
];

module.exports = {
  appId: "org.liteforms.web",
  productName: "Liteforms",
  asar: true,
  compression: "maximum",
  npmRebuild: false,
  removePackageScripts: true,
  directories: {
    output: "release"
  },
  files: [
    "dist-electron/**",
    ".next/standalone/**",
    ".next/static/**",
    "node_modules/@koromix/koffi-*/**",
    "node_modules/koffi/**",
    "public/**",
    "native/bridge/*.md",
    "native/bridge/*.txt",
    "package.json",
    "!**/.env",
    "!**/.env.*",
    "!**/.env*.local",
    "!**/*.map",
    "!**/node_modules/.cache/**",
    "!**/__tests__/**",
    "!**/*.test.*",
    "!**/*.smoke.test.*"
  ],
  asarUnpack: [
    ".next/standalone/**",
    "node_modules/@koromix/koffi-*/**",
    "node_modules/koffi/**"
  ],
  extraResources: nativeBridgeResources,
  win: {
    ...windowsSigningConfig,
    files: windowsNativeBinaryExcludes,
    signExts: [".dll", ".node"],
    target: ["nsis"]
  },
  mac: {
    files: macNativeBinaryExcludes,
    target: ["dmg"],
    category: "public.app-category.entertainment",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    notarize: false
  }
};
