/** @type {import("electron-builder").Configuration} */
const { existsSync } = module.require("node:fs");

const nativeBridgeResources = [
  { from: "native/bridge/win32-x64", to: "bridge/win32-x64", filter: ["**/*"] },
  { from: "native/bridge/darwin-x64", to: "bridge/darwin-x64", filter: ["**/*"] },
  { from: "native/bridge/darwin-arm64", to: "bridge/darwin-arm64", filter: ["**/*"] }
].filter(({ from }) => existsSync(from));

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
    signAndEditExecutable: false,
    target: ["nsis"]
  },
  mac: {
    target: ["dmg"],
    category: "public.app-category.entertainment"
  }
};
