import { BridgeClient } from "@lookingglass/bridge";
import {
  getNativeLookingGlassBridgeState,
  hasNativeLookingGlassBridgeApi,
} from "./nativeLookingGlassBridge";

type BridgeConnectionOptions = {
  getBridgeClient?: () => Pick<BridgeClient, "status">;
  getNativeBridgeState?: typeof getNativeLookingGlassBridgeState;
  hasNativeBridgeApi?: typeof hasNativeLookingGlassBridgeApi;
};

export function checkLookingGlassBridgeConnection({
  getBridgeClient = () => BridgeClient.getInstance(),
  getNativeBridgeState = getNativeLookingGlassBridgeState,
  hasNativeBridgeApi = hasNativeLookingGlassBridgeApi,
}: BridgeConnectionOptions = {}): Promise<boolean> {
  if (hasNativeBridgeApi()) {
    return getNativeBridgeState().then((state) => state.available).catch(() => false);
  }

  try {
    return getBridgeClient().status();
  } catch {
    return Promise.resolve(false);
  }
}
