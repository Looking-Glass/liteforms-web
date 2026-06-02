import { describe, expect, it } from "vitest";
import {
  getNativeBridgeLongType,
  getNativeBridgeUnsignedLongByteLength,
  getNativeBridgeUnsignedLongType,
  readNativeBridgeUnsignedLong,
} from "./nativeBridgeProbe";

describe("native Bridge probe ABI helpers", () => {
  it("uses Windows unsigned long and long widths from the Bridge SDK header", () => {
    expect(getNativeBridgeUnsignedLongType("win32")).toBe("uint32_t");
    expect(getNativeBridgeLongType("win32")).toBe("int32_t");
    expect(getNativeBridgeUnsignedLongByteLength("win32")).toBe(4);
  });

  it("uses 64-bit unsigned long widths on Darwin", () => {
    expect(getNativeBridgeUnsignedLongType("darwin")).toBe("uint64_t");
    expect(getNativeBridgeLongType("darwin")).toBe("int64_t");
    expect(getNativeBridgeUnsignedLongByteLength("darwin")).toBe(8);
  });

  it("reads packed Windows display indices without skipping every other value", () => {
    const buffer = Buffer.alloc(8);
    buffer.writeUInt32LE(7, 0);
    buffer.writeUInt32LE(42, 4);

    expect(readNativeBridgeUnsignedLong(buffer, 0, "win32")).toBe(7);
    expect(readNativeBridgeUnsignedLong(buffer, 1, "win32")).toBe(42);
  });
});
