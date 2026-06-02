import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const spawnMock = vi.fn();

vi.mock("electron", () => ({
  app: {
    getAppPath: () => "C:\\repo\\liteforms-web",
    isPackaged: false,
  },
}));

vi.mock("node:child_process", () => ({
  spawn: spawnMock,
}));

vi.mock("node:fs", () => ({
  existsSync: () => true,
}));

describe("native Bridge service", () => {
  beforeEach(() => {
    spawnMock.mockReset();
  });

  it("reads probe JSON from fd 3 because the native Bridge DLL redirects stdout", async () => {
    const state = {
      available: true,
      source: "native",
      display: {
        id: "0",
        name: "Looking Glass Go",
        serial: "LKG-G123",
        width: 2560,
        height: 1440,
      },
      calibration: {
        configVersion: "1.0",
        pitch: { value: 1 },
        slope: { value: 2 },
        center: { value: 3 },
        viewCone: { value: 4 },
        invView: { value: 0 },
        verticalAngle: { value: 0 },
        DPI: { value: 300 },
        screenW: { value: 2560 },
        screenH: { value: 1440 },
        flipImageX: { value: 0 },
        flipImageY: { value: 0 },
        flipSubp: { value: 0 },
        serial: "LKG-G123",
        subpixelCells: [],
        CellPatternMode: { value: 0 },
      },
    };

    spawnMock.mockImplementation(() => {
      const child = new EventEmitter() as EventEmitter & {
        killed: boolean;
        kill: ReturnType<typeof vi.fn>;
        stderr: PassThrough;
        stdout: PassThrough;
        stdio: Array<PassThrough | null>;
      };
      const resultPipe = new PassThrough();

      child.killed = false;
      child.kill = vi.fn();
      child.stdout = new PassThrough();
      child.stderr = new PassThrough();
      child.stdio = [null, child.stdout, child.stderr, resultPipe];

      process.nextTick(() => {
        resultPipe.end(JSON.stringify(state));
        child.emit("close", 0, null);
      });

      return child;
    });

    const { createNativeBridgeService } = await import("./nativeBridge");
    const service = createNativeBridgeService();

    await expect(service.getState()).resolves.toEqual(state);

    const spawnOptions = spawnMock.mock.calls[0][2];
    expect(spawnOptions.stdio).toEqual(["ignore", "pipe", "pipe", "pipe"]);
    expect(spawnOptions.env.LITEFORMS_NATIVE_BRIDGE_RESULT_FD).toBe("3");
  });
});
