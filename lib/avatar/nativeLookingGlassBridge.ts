export type NativeLookingGlassBridgeState = LiteformsNativeBridgeState;
export type NativeLookingGlassBridgeDriverStatus = LiteformsNativeBridgeDriverStatus;

function getBrowserWindow(): Window | undefined {
  return typeof window === "undefined" ? undefined : window;
}

type LookingGlassConfigLike = {
  calibration: unknown;
  updateViewControls(value: never): void;
};

export function hasNativeLookingGlassBridgeApi(
  targetWindow: Pick<Window, "liteformsElectron"> | undefined = getBrowserWindow()
) {
  return Boolean(targetWindow?.liteformsElectron?.lookingGlassBridge);
}

export async function getNativeLookingGlassBridgeState(
  targetWindow: Pick<Window, "liteformsElectron"> | undefined = getBrowserWindow()
): Promise<NativeLookingGlassBridgeState> {
  const bridge = targetWindow?.liteformsElectron?.lookingGlassBridge;
  if (!bridge) {
    return {
      available: false,
      source: "native",
      error: "Native Looking Glass Bridge is only available in the Electron build."
    };
  }

  try {
    return await bridge.getState();
  } catch (error) {
    return {
      available: false,
      source: "native",
      error: error instanceof Error ? error.message : "Native Looking Glass Bridge IPC failed."
    };
  }
}

export async function getNativeLookingGlassBridgeDriverStatus(
  targetWindow: Pick<Window, "liteformsElectron"> | undefined = getBrowserWindow()
): Promise<NativeLookingGlassBridgeDriverStatus> {
  const bridge = targetWindow?.liteformsElectron?.lookingGlassBridge;
  if (!bridge) {
    return {
      available: false,
      source: "native",
      error: "Native Looking Glass Bridge is only available in the Electron build."
    };
  }

  try {
    return await bridge.getDriverStatus();
  } catch (error) {
    return {
      available: false,
      source: "native",
      error: error instanceof Error ? error.message : "Native Looking Glass Bridge driver IPC failed."
    };
  }
}

export function applyNativeLookingGlassBridgeCalibration(
  config: LookingGlassConfigLike,
  state: NativeLookingGlassBridgeState
) {
  if (!state.available) return false;

  config.calibration = state.calibration;

  if (state.viewControls) {
    const { columns, rows, quiltResolution } = state.viewControls;
    config.updateViewControls({
      ...(columns && columns > 0 ? { columns } : {}),
      ...(rows && rows > 0 ? { rows } : {}),
      ...(quiltResolution?.width && quiltResolution.height ? { quiltResolution } : {})
    } as never);
  }

  return true;
}
