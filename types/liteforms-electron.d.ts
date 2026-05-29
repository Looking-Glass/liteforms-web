declare global {
  type LiteformsNativeBridgeValue = {
    value: number;
  };

  type LiteformsNativeBridgeCalibration = {
    configVersion: string;
    pitch: LiteformsNativeBridgeValue;
    slope: LiteformsNativeBridgeValue;
    center: LiteformsNativeBridgeValue;
    viewCone: LiteformsNativeBridgeValue;
    invView: LiteformsNativeBridgeValue;
    verticalAngle: LiteformsNativeBridgeValue;
    DPI: LiteformsNativeBridgeValue;
    screenW: LiteformsNativeBridgeValue;
    screenH: LiteformsNativeBridgeValue;
    flipImageX: LiteformsNativeBridgeValue;
    flipImageY: LiteformsNativeBridgeValue;
    flipSubp: LiteformsNativeBridgeValue;
    serial: string;
    subpixelCells: Array<{
      ROffsetX: number;
      ROffsetY: number;
      GOffsetX: number;
      GOffsetY: number;
      BOffsetX: number;
      BOffsetY: number;
    }>;
    CellPatternMode: LiteformsNativeBridgeValue;
  };

  type LiteformsNativeBridgeState =
    | {
        available: true;
        source: "native";
        display: {
          id: string;
          name: string;
          serial: string;
          width: number;
          height: number;
          x?: number;
          y?: number;
        };
        calibration: LiteformsNativeBridgeCalibration;
        viewControls?: {
          columns?: number;
          rows?: number;
          quiltResolution?: {
            width: number;
            height: number;
          };
        };
      }
    | {
        available: false;
        source: "native";
        error: string;
      };

  type LiteformsNativeBridgeDriverStatus =
    | {
        available: true;
        source: "native";
        platformDir: string;
        runtimeDir: string;
        libraryPath: string;
        libraryName: string;
        runtimeSource: "bundled" | "override";
      }
    | {
        available: false;
        source: "native";
        error: string;
      };

  type LiteformsElectronApi = {
    isElectron: true;
    platform: NodeJS.Platform;
    versions: {
      chrome: string;
      electron: string;
      node: string;
    };
    lookingGlassBridge: {
      getDriverStatus(): Promise<LiteformsNativeBridgeDriverStatus>;
      getState(): Promise<LiteformsNativeBridgeState>;
    };
  };

  interface Window {
    liteformsElectron?: LiteformsElectronApi;
  }
}

export {};
