import { contextBridge } from "electron";

const liteformsElectron = Object.freeze({
  isElectron: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  }
});

contextBridge.exposeInMainWorld("liteformsElectron", liteformsElectron);
