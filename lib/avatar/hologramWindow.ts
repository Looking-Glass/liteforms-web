type LookingGlassConnectionState = {
  calibration?: {
    serial?: string;
  };
};

export type ScreenLike = {
  left: number;
  top: number;
  width: number;
  height: number;
  isPrimary?: boolean;
};

export type WindowPositionLike = {
  screenLeft?: number;
  screenTop?: number;
  screenX?: number;
  screenY?: number;
};

export function isLookingGlassDeviceConnected(config: LookingGlassConnectionState): boolean {
  return Boolean(config.calibration?.serial?.trim());
}

export function shouldHideHologramButtonForScreen(screen: unknown): boolean {
  if (!screen || typeof screen !== "object" || !("isExtended" in screen)) return false;
  return (screen as { isExtended?: unknown }).isExtended === false;
}

export async function detectSingleScreen(win: unknown): Promise<boolean | undefined> {
  if (!win || typeof win !== "object") return undefined;

  const screen = (win as { screen?: unknown }).screen;
  if (screen && typeof screen === "object" && "isExtended" in screen) {
    return (screen as { isExtended?: unknown }).isExtended === false;
  }

  const screenDetailsWindow = win as {
    getScreenDetails?: () => Promise<{ screens?: ScreenLike[] }>;
  };
  if (typeof screenDetailsWindow.getScreenDetails !== "function") return undefined;

  try {
    const screenDetails = await screenDetailsWindow.getScreenDetails();
    if (!Array.isArray(screenDetails.screens)) return undefined;
    return screenDetails.screens.length <= 1;
  } catch {
    return undefined;
  }
}

export function findSecondaryScreen(
  screens: ScreenLike[],
  currentWindow: WindowPositionLike = {}
): ScreenLike | undefined {
  const nonPrimary = screens.find((screen) => screen.isPrimary === false);
  if (nonPrimary) return nonPrimary;

  const currentLeft = currentWindow.screenLeft ?? currentWindow.screenX ?? 0;
  const currentTop = currentWindow.screenTop ?? currentWindow.screenY ?? 0;
  return screens.find((screen) => screen.left !== currentLeft || screen.top !== currentTop);
}

export function buildPopupFeatureString(screen?: ScreenLike): string {
  const bounds = screen ?? { left: 0, top: 0, width: 640, height: 960 };
  return [
    `left=${bounds.left}`,
    `top=${bounds.top}`,
    `width=${bounds.width}`,
    `height=${bounds.height}`,
    "menubar=no",
    "toolbar=no",
    "location=no",
    "status=no",
    "resizable=yes",
    "scrollbars=no",
    "fullscreenEnabled=true",
  ].join(",");
}

export async function openHldHologramWindow(win: Window): Promise<Window | null> {
  let targetScreen: ScreenLike | undefined;

  if ("getScreenDetails" in win) {
    try {
      const screenDetails = await (win as Window & {
        getScreenDetails: () => Promise<{ screens: ScreenLike[] }>;
      }).getScreenDetails();
      targetScreen = findSecondaryScreen(screenDetails.screens, win);
    } catch {
      targetScreen = undefined;
    }
  }

  return win.open("", "liteforms-hld-hologram", buildPopupFeatureString(targetScreen));
}
