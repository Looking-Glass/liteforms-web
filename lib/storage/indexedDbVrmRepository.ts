"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { StoredVrm, VrmRepository } from "./vrmRepository";

const VRM_RECORD_ID = "current";

type LiteformsVrmDb = DBSchema & {
  "vrm": {
    key: string;
    value: { id: string; arrayBuffer: ArrayBuffer; fileName: string };
  };
};

export async function createIndexedDbVrmRepository(): Promise<VrmRepository> {
  const db = await openDB<LiteformsVrmDb>("liteforms-vrm", 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("vrm")) {
        database.createObjectStore("vrm", { keyPath: "id" });
      }
    }
  });

  return new IndexedDbVrmRepository(db);
}

class IndexedDbVrmRepository implements VrmRepository {
  constructor(private readonly db: IDBPDatabase<LiteformsVrmDb>) {}

  async save(arrayBuffer: ArrayBuffer, fileName: string): Promise<void> {
    await this.db.put("vrm", { id: VRM_RECORD_ID, arrayBuffer, fileName });
  }

  async load(): Promise<StoredVrm | null> {
    const record = await this.db.get("vrm", VRM_RECORD_ID);
    if (!record) return null;
    return { arrayBuffer: record.arrayBuffer, fileName: record.fileName };
  }

  async clear(): Promise<void> {
    await this.db.delete("vrm", VRM_RECORD_ID);
  }
}
