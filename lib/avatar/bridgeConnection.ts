import { BridgeClient } from "@lookingglass/bridge";

type BridgeConnectionOptions = {
  getBridgeClient?: () => Pick<BridgeClient, "status">;
};

export function checkLookingGlassBridgeConnection({
  getBridgeClient = () => BridgeClient.getInstance(),
}: BridgeConnectionOptions = {}): Promise<boolean> {
  try {
    return getBridgeClient().status();
  } catch {
    return Promise.resolve(false);
  }
}
