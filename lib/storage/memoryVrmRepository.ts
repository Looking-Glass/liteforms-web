import type { StoredVrm, VrmRepository } from "./vrmRepository";

class MemoryVrmRepository implements VrmRepository {
  private stored: StoredVrm | null = null;

  async save(arrayBuffer: ArrayBuffer, fileName: string): Promise<void> {
    this.stored = { arrayBuffer, fileName };
  }

  async load(): Promise<StoredVrm | null> {
    return this.stored;
  }

  async clear(): Promise<void> {
    this.stored = null;
  }
}

export function createMemoryVrmRepository(): VrmRepository {
  return new MemoryVrmRepository();
}
