declare module "@lookingglass/bridge" {
  export class BridgeClient {
    static getInstance(): BridgeClient;
    status(): Promise<boolean>;
  }
}
