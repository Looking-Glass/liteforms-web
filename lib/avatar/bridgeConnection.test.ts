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

  it("uses the native Electron Bridge driver status when available", async () => {
    const status = vi.fn().mockResolvedValue(false);
    const getNativeBridgeDriverStatus = vi.fn().mockResolvedValue({ available: true, source: "native" });

    await expect(
      checkLookingGlassBridgeConnection({
        getBridgeClient: () => ({ status }),
        getNativeBridgeDriverStatus,
        hasNativeBridgeApi: () => true,
      })
    ).resolves.toBe(true);

    expect(getNativeBridgeDriverStatus).toHaveBeenCalledOnce();
    expect(status).not.toHaveBeenCalled();
  });
});
