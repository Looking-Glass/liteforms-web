import koffi from "koffi";
import { writeSync } from "node:fs";

type Value = {
  value: number;
};

type NativeCalibration = {
  configVersion: string;
  pitch: Value;
  slope: Value;
  center: Value;
  viewCone: Value;
  invView: Value;
  verticalAngle: Value;
  DPI: Value;
  screenW: Value;
  screenH: Value;
  flipImageX: Value;
  flipImageY: Value;
  flipSubp: Value;
  serial: string;
  subpixelCells: Array<{
    ROffsetX: number;
    ROffsetY: number;
    GOffsetX: number;
    GOffsetY: number;
    BOffsetX: number;
    BOffsetY: number;
  }>;
  CellPatternMode: Value;
};

type ProbeResult =
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
      calibration: NativeCalibration;
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

type NativeBridgeUnsignedLong = number | bigint;
type NativeBridgeLong = number | bigint;

function value(input: number): Value {
  return { value: Number.isFinite(input) ? input : 0 };
}

function writeResult(result: ProbeResult) {
  const payload = JSON.stringify(result);
  const resultFd = Number(process.env.LITEFORMS_NATIVE_BRIDGE_RESULT_FD);

  if (Number.isInteger(resultFd) && resultFd >= 3) {
    try {
      writeSync(resultFd, payload);
      return;
    } catch {
      // Fall back to stdout for direct CLI probes.
    }
  }

  process.stdout.write(payload);
}

export function getNativeBridgeUnsignedLongType(platform: NodeJS.Platform = process.platform) {
  return platform === "win32" ? "uint32_t" : "uint64_t";
}

export function getNativeBridgeLongType(platform: NodeJS.Platform = process.platform) {
  return platform === "win32" ? "int32_t" : "int64_t";
}

export function getNativeBridgeUnsignedLongByteLength(platform: NodeJS.Platform = process.platform) {
  return platform === "win32" ? 4 : 8;
}

function createNativeBridgeUnsignedLongRef(platform: NodeJS.Platform = process.platform): NativeBridgeUnsignedLong[] {
  return [platform === "win32" ? 0 : BigInt(0)];
}

function createNativeBridgeLongRef(platform: NodeJS.Platform = process.platform): NativeBridgeLong[] {
  return [platform === "win32" ? 0 : BigInt(0)];
}

export function readNativeBridgeUnsignedLong(
  buffer: Buffer,
  index: number,
  platform: NodeJS.Platform = process.platform
) {
  const byteOffset = index * getNativeBridgeUnsignedLongByteLength(platform);
  return platform === "win32" ? buffer.readUInt32LE(byteOffset) : buffer.readBigUInt64LE(byteOffset);
}

function decodeNativeWideString(buffer: Buffer) {
  if (process.platform === "win32") {
    return buffer.toString("utf16le").replace(/\0.*$/u, "");
  }

  let text = "";
  for (let offset = 0; offset + 4 <= buffer.length; offset += 4) {
    const codePoint = buffer.readUInt32LE(offset);
    if (codePoint === 0) break;
    text += String.fromCodePoint(codePoint);
  }
  return text;
}

function readDisplayString(
  fn: (displayId: NativeBridgeUnsignedLong, length: number[], output: Buffer | null) => boolean,
  displayId: NativeBridgeUnsignedLong
) {
  const length = [0];
  fn(displayId, length, null);
  if (length[0] <= 0) return "";

  const bytesPerCharacter = process.platform === "win32" ? 2 : 4;
  const buffer = Buffer.alloc(length[0] * bytesPerCharacter);
  if (!fn(displayId, length, buffer)) return "";
  return decodeNativeWideString(buffer);
}

function readDisplays(getDisplays: (count: number[], displays: Buffer | null) => boolean) {
  const count = [0];
  if (!getDisplays(count, null)) {
    throw new Error("get_displays failed while reading the display count.");
  }

  if (count[0] <= 0) return [];

  const displayBuffer = Buffer.alloc(count[0] * getNativeBridgeUnsignedLongByteLength());
  if (!getDisplays(count, displayBuffer)) {
    throw new Error("get_displays failed while reading display IDs.");
  }

  return Array.from({ length: count[0] }, (_, index) => readNativeBridgeUnsignedLong(displayBuffer, index));
}

function readSubpixelCells(buffer: Buffer, cellCount: number) {
  const values = new Float32Array(buffer.buffer, buffer.byteOffset, Math.floor(buffer.byteLength / 4));
  const cells = [];
  const maxCells = Math.min(cellCount, Math.floor(values.length / 6));

  for (let index = 0; index < maxCells; index += 1) {
    cells.push({
      ROffsetX: values[index * 6],
      ROffsetY: values[index * 6 + 1],
      GOffsetX: values[index * 6 + 2],
      GOffsetY: values[index * 6 + 3],
      BOffsetX: values[index * 6 + 4],
      BOffsetY: values[index * 6 + 5]
    });
  }

  return cells;
}

function main() {
  const libraryPath = process.env.LITEFORMS_NATIVE_BRIDGE_LIBRARY;
  const runtimeDir = process.env.LITEFORMS_NATIVE_BRIDGE_RUNTIME_DIR;

  if (!libraryPath || !runtimeDir) {
    writeResult({
      available: false,
      source: "native",
      error: "Native Bridge probe was launched without a library path."
    });
    return;
  }

  if (process.platform === "win32") {
    process.env.PATH = `${runtimeDir};${process.env.PATH ?? ""}`;
  }

  const nativeUnsignedLongType = getNativeBridgeUnsignedLongType();
  const nativeLongType = getNativeBridgeLongType();
  const lib = koffi.load(libraryPath);
  const initializeBridge = lib.func("bool initialize_bridge(const wchar_t *app_name)");
  const uninitializeBridge = lib.func("bool uninitialize_bridge(void)");
  const getDisplays = lib.func(`bool get_displays(_Inout_ int32_t *count, _Out_ ${nativeUnsignedLongType} *displays)`) as (
    count: number[],
    displays: Buffer | null
  ) => boolean;
  const getDeviceName = lib.func(
    `bool get_device_name_for_display(${nativeUnsignedLongType} display, _Inout_ int32_t *length, void *output)`
  ) as (displayId: NativeBridgeUnsignedLong, length: number[], output: Buffer | null) => boolean;
  const getDeviceSerial = lib.func(
    `bool get_device_serial_for_display(${nativeUnsignedLongType} display, _Inout_ int32_t *length, void *output)`
  ) as (displayId: NativeBridgeUnsignedLong, length: number[], output: Buffer | null) => boolean;
  const getDimensions = lib.func(
    `bool get_dimensions_for_display(${nativeUnsignedLongType} display, _Out_ ${nativeUnsignedLongType} *width, _Out_ ${nativeUnsignedLongType} *height)`
  ) as (
    displayId: NativeBridgeUnsignedLong,
    width: NativeBridgeUnsignedLong[],
    height: NativeBridgeUnsignedLong[]
  ) => boolean;
  const getWindowPosition = lib.func(
    `bool get_window_position_for_display(${nativeUnsignedLongType} display, _Out_ ${nativeLongType} *x, _Out_ ${nativeLongType} *y)`
  ) as (displayId: NativeBridgeUnsignedLong, x: NativeBridgeLong[], y: NativeBridgeLong[]) => boolean;
  const getDefaultQuiltSettings = lib.func(
    `bool get_default_quilt_settings_for_display(${nativeUnsignedLongType} display, _Out_ float *aspect, _Out_ int32_t *quilt_width, _Out_ int32_t *quilt_height, _Out_ int32_t *columns, _Out_ int32_t *rows)`
  ) as (
    displayId: NativeBridgeUnsignedLong,
    aspect: number[],
    quiltWidth: number[],
    quiltHeight: number[],
    columns: number[],
    rows: number[]
  ) => boolean;
  const getCalibration = lib.func(
    `bool get_calibration_for_display(${nativeUnsignedLongType} display, _Out_ float *center, _Out_ float *pitch, _Out_ float *slope, _Out_ int32_t *width, _Out_ int32_t *height, _Out_ float *dpi, _Out_ float *flip_x, _Out_ int32_t *inv_view, _Out_ float *viewcone, _Out_ float *fringe, _Out_ int32_t *cell_pattern_mode, _Inout_ int32_t *cell_count, void *cells)`
  ) as (
    displayId: NativeBridgeUnsignedLong,
    center: number[],
    pitch: number[],
    slope: number[],
    width: number[],
    height: number[],
    dpi: number[],
    flipX: number[],
    invView: number[],
    viewCone: number[],
    fringe: number[],
    cellPatternMode: number[],
    cellCount: number[],
    cells: Buffer | null
  ) => boolean;

  if (!initializeBridge("Liteforms")) {
    writeResult({
      available: false,
      source: "native",
      error: "initialize_bridge returned false."
    });
    return;
  }

  try {
    const displays = readDisplays(getDisplays);
    if (displays.length === 0) {
      writeResult({
        available: false,
        source: "native",
        error: "No Looking Glass displays were reported by the native Bridge driver."
      });
      return;
    }

    const displayId = displays[0];
    const center = [0];
    const pitch = [0];
    const slope = [0];
    const width = [0];
    const height = [0];
    const dpi = [0];
    const flipX = [0];
    const invView = [0];
    const viewCone = [0];
    const fringe = [0];
    const cellPatternMode = [0];
    const cellCount = [0];

    if (
      !getCalibration(
        displayId,
        center,
        pitch,
        slope,
        width,
        height,
        dpi,
        flipX,
        invView,
        viewCone,
        fringe,
        cellPatternMode,
        cellCount,
        null
      )
    ) {
      throw new Error("get_calibration_for_display failed.");
    }

    const cellBuffer = cellCount[0] > 0 ? Buffer.alloc(cellCount[0] * 6 * 4) : Buffer.alloc(0);
    if (
      cellBuffer.length > 0 &&
      !getCalibration(
        displayId,
        center,
        pitch,
        slope,
        width,
        height,
        dpi,
        flipX,
        invView,
        viewCone,
        fringe,
        cellPatternMode,
        cellCount,
        cellBuffer
      )
    ) {
      throw new Error("get_calibration_for_display failed while reading subpixel cells.");
    }

    const displayWidth = createNativeBridgeUnsignedLongRef();
    const displayHeight = createNativeBridgeUnsignedLongRef();
    try {
      getDimensions(displayId, displayWidth, displayHeight);
    } catch {
      // Calibration width/height below are enough for WebXR if dimensions are unavailable.
    }

    const windowX = createNativeBridgeLongRef();
    const windowY = createNativeBridgeLongRef();
    let hasWindowPosition = false;
    try {
      hasWindowPosition = getWindowPosition(displayId, windowX, windowY);
    } catch {
      hasWindowPosition = false;
    }

    const aspect = [0];
    const quiltWidth = [0];
    const quiltHeight = [0];
    const columns = [0];
    const rows = [0];
    let hasQuiltSettings = false;
    try {
      hasQuiltSettings = getDefaultQuiltSettings(displayId, aspect, quiltWidth, quiltHeight, columns, rows);
    } catch {
      hasQuiltSettings = false;
    }

    let serial = "";
    let name = "";
    try {
      serial = readDisplayString(getDeviceSerial, displayId);
      name = readDisplayString(getDeviceName, displayId);
    } catch {
      serial = "";
      name = "";
    }
    const fallbackScreenWidth = Number(displayWidth[0]) || width[0];
    const fallbackScreenHeight = Number(displayHeight[0]) || height[0];

    writeResult({
      available: true,
      source: "native",
      display: {
        id: displayId.toString(),
        name,
        serial,
        width: fallbackScreenWidth,
        height: fallbackScreenHeight,
        ...(hasWindowPosition ? { x: Number(windowX[0]), y: Number(windowY[0]) } : {})
      },
      calibration: {
        configVersion: "1.0",
        pitch: value(pitch[0]),
        slope: value(slope[0]),
        center: value(center[0]),
        viewCone: value(viewCone[0]),
        invView: value(invView[0]),
        verticalAngle: value(0),
        DPI: value(dpi[0]),
        screenW: value(width[0] || fallbackScreenWidth),
        screenH: value(height[0] || fallbackScreenHeight),
        flipImageX: value(flipX[0]),
        flipImageY: value(0),
        flipSubp: value(0),
        serial,
        subpixelCells: readSubpixelCells(cellBuffer, cellCount[0]),
        CellPatternMode: value(cellPatternMode[0])
      },
      ...(hasQuiltSettings
        ? {
            viewControls: {
              columns: columns[0],
              rows: rows[0],
              quiltResolution: {
                width: quiltWidth[0],
                height: quiltHeight[0]
              }
            }
          }
        : {})
    });
  } finally {
    uninitializeBridge();
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    writeResult({
      available: false,
      source: "native",
      error: error instanceof Error ? error.message : "Unknown native Bridge probe error."
    });
  }
}
