import { describe, expect, it, vi } from "vitest";
import { checkLookingGlassBridgeConnection } from "./bridgeConnection";

describe("checkLookingGlassBridgeConnection", () => {
  it("reports Bridge connected when Bridge.js status succeeds", async () => {
    const status = vi.fn().mockResolvedValue(true);

    await expect(checkLookingGlassBridgeConnection({ getBridgeClient: () => ({ status }) })).resolves.toBe(true);
    expect(status).toHaveBeenCalledOnce();
  });

  it("reports Bridge missing when Bridge.js status returns false", async () => {
    const status = vi.fn().mockResolvedValue(false);

    await expect(checkLookingGlassBridgeConnection({ getBridgeClient: () => ({ status }) })).resolves.toBe(false);
    expect(status).toHaveBeenCalledOnce();
  });

  it("reports Bridge missing when Bridge.js cannot create a client", async () => {
    const getBridgeClient = vi.fn(() => {
      throw new Error("Bridge unavailable");
    });

    await expect(checkLookingGlassBridgeConnection({ getBridgeClient })).resolves.toBe(false);
  });

  it("uses the native Electron Bridge state when available", async () => {
    const status = vi.fn().mockResolvedValue(false);
    const getNativeBridgeState = vi.fn().mockResolvedValue({ available: true, source: "native" });

    await expect(
      checkLookingGlassBridgeConnection({
        getBridgeClient: () => ({ status }),
        getNativeBridgeState,
        hasNativeBridgeApi: () => true,
      })
    ).resolves.toBe(true);

    expect(getNativeBridgeState).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });

  it("reports Bridge missing when the native Electron driver exists but no display is detected", async () => {
    const status = vi.fn().mockResolvedValue(true);
    const getNativeBridgeState = vi.fn().mockResolvedValue({
      available: false,
      source: "native",
      error: "No Looking Glass displays were reported by the native Bridge driver.",
    });

    await expect(
      checkLookingGlassBridgeConnection({
        getBridgeClient: () => ({ status }),
        getNativeBridgeState,
        hasNativeBridgeApi: () => true,
      })
    ).resolves.toBe(false);

    expect(getNativeBridgeState).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});
