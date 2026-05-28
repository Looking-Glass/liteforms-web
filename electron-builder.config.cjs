/** @type {import("electron-builder").Configuration} */
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
    "public/**",
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
    ".next/standalone/**"
  ],
  win: {
    signAndEditExecutable: false,
    target: ["nsis"]
  },
  mac: {
    target: ["dmg"],
    category: "public.app-category.entertainment"
  },
  linux: {
    target: ["AppImage"],
    category: "AudioVideo"
  }
};
