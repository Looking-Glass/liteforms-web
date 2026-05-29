import { contextBridge, ipcRenderer } from "electron";

const nativeBridgeGetStateChannel = "liteforms:nativeBridge:getState";
const nativeBridgeGetDriverStatusChannel = "liteforms:nativeBridge:getDriverStatus";

const liteformsElectron = Object.freeze({
  isElectron: true,
  platform: process.platform,
  versions: {
    chrome: process.versions.chrome,
    electron: process.versions.electron,
    node: process.versions.node
  },
  lookingGlassBridge: {
    getDriverStatus: () => ipcRenderer.invoke(nativeBridgeGetDriverStatusChannel),
    getState: () => ipcRenderer.invoke(nativeBridgeGetStateChannel)
  }
});

contextBridge.exposeInMainWorld("liteformsElectron", liteformsElectron);
