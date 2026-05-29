import { BridgeClient } from "@lookingglass/bridge";
import {
  getNativeLookingGlassBridgeDriverStatus,
  hasNativeLookingGlassBridgeApi,
} from "./nativeLookingGlassBridge";

type BridgeConnectionOptions = {
  getBridgeClient?: () => Pick<BridgeClient, "status">;
  getNativeBridgeDriverStatus?: typeof getNativeLookingGlassBridgeDriverStatus;
  hasNativeBridgeApi?: typeof hasNativeLookingGlassBridgeApi;
};

export function checkLookingGlassBridgeConnection({
  getBridgeClient = () => BridgeClient.getInstance(),
  getNativeBridgeDriverStatus = getNativeLookingGlassBridgeDriverStatus,
  hasNativeBridgeApi = hasNativeLookingGlassBridgeApi,
}: BridgeConnectionOptions = {}): Promise<boolean> {
  if (hasNativeBridgeApi()) {
    return getNativeBridgeDriverStatus().then((state) => state.available).catch(() => false);
  }

  try {
    return getBridgeClient().status();
  } catch {
    return Promise.resolve(false);
  }
}
