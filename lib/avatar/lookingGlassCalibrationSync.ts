type CalibrationValue = {
  value?: number;
};

export type LookingGlassSubpixelCell = {
  ROffsetX: number;
  ROffsetY: number;
  GOffsetX: number;
  GOffsetY: number;
  BOffsetX: number;
  BOffsetY: number;
};

export type LookingGlassCalibrationLike = {
  serial?: string;
  screenW?: CalibrationValue;
  screenH?: CalibrationValue;
  CellPatternMode?: CalibrationValue;
  subpixelCells?: LookingGlassSubpixelCell[];
};

export type LookingGlassConfigLike = {
  calibration?: LookingGlassCalibrationLike;
  subpixelMode?: number;
  updateViewControls(value: { subpixelMode?: number }): void;
  addEventListener?(
    type: "on-config-changed",
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ): void;
  removeEventListener?(
    type: "on-config-changed",
    callback: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions
  ): void;
};

type LookingGlassConfigWithInternals = LookingGlassConfigLike & {
  _viewControls?: {
    subpixelMode?: number;
  };
};

const subpixelCellFields = [
  "ROffsetX",
  "ROffsetY",
  "GOffsetX",
  "GOffsetY",
  "BOffsetX",
  "BOffsetY",
] as const;

function cloneSubpixelCells(cells: LookingGlassSubpixelCell[]): LookingGlassSubpixelCell[] {
  return cells.map((cell) => ({
    ROffsetX: cell.ROffsetX,
    ROffsetY: cell.ROffsetY,
    GOffsetX: cell.GOffsetX,
    GOffsetY: cell.GOffsetY,
    BOffsetX: cell.BOffsetX,
    BOffsetY: cell.BOffsetY,
  }));
}

function calibrationKey(calibration: LookingGlassCalibrationLike): string {
  const screenW = calibration.screenW?.value ?? "";
  const screenH = calibration.screenH?.value ?? "";
  const cellPatternMode = calibration.CellPatternMode?.value ?? "";
  const cellCount = calibration.subpixelCells?.length ?? 0;
  return `${calibration.serial ?? ""}:${screenW}:${screenH}:${cellPatternMode}:${cellCount}`;
}

function hasRawSubpixelOffsets(cells: LookingGlassSubpixelCell[]): boolean {
  return cells.some((cell) =>
    subpixelCellFields.some((field) => Math.abs(cell[field]) > 0.01)
  );
}

function readCellPatternMode(calibration?: LookingGlassCalibrationLike): number | undefined {
  const value = calibration?.CellPatternMode?.value;
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.round(value);
}

function setSubpixelMode(config: LookingGlassConfigLike, mode: number): boolean {
  if (config.subpixelMode === mode) return false;

  const configWithInternals = config as LookingGlassConfigWithInternals;
  if (configWithInternals._viewControls) {
    // Avoid a nested config-change dispatch; shader listeners later in the
    // current event should see the calibration's cell pattern immediately.
    configWithInternals._viewControls.subpixelMode = mode;
    return true;
  }

  config.updateViewControls({ subpixelMode: mode });
  return true;
}

export function createLookingGlassCalibrationSync(config: LookingGlassConfigLike): () => void {
  let rawSubpixelCells: LookingGlassSubpixelCell[] | undefined;
  let rawSubpixelCellsKey = "";

  const sync = () => {
    const calibration = config.calibration;
    if (!calibration) return;

    const cells = calibration.subpixelCells;
    const key = calibrationKey(calibration);
    if (cells?.length) {
      if (rawSubpixelCells && rawSubpixelCellsKey === key) {
        // @lookingglass/webxr normalizes these offsets in place when compiling
        // the shader, so restore raw calibration values before every recompile.
        calibration.subpixelCells = cloneSubpixelCells(rawSubpixelCells);
      } else if (hasRawSubpixelOffsets(cells)) {
        rawSubpixelCells = cloneSubpixelCells(cells);
        rawSubpixelCellsKey = key;
      }
    }

    const cellPatternMode = readCellPatternMode(calibration);
    if (cellPatternMode !== undefined) {
      setSubpixelMode(config, cellPatternMode);
    }
  };

  sync();
  config.addEventListener?.("on-config-changed", sync);

  return () => {
    config.removeEventListener?.("on-config-changed", sync);
  };
}
