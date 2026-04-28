"use client";

import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { BrowserCredential, BrowserCredentialInput, CredentialRepository } from "./types";

type LiteformsLocalDb = DBSchema & {
  "liteforms.credentials": {
    key: string;
    value: BrowserCredential;
    indexes: { "by-provider": string };
  };
};

export async function createIndexedDbCredentialRepository(): Promise<CredentialRepository> {
  const db = await openDB<LiteformsLocalDb>("liteforms", 1, {
    upgrade(database) {
      if (!database.objectStoreNames.contains("liteforms.credentials")) {
        const store = database.createObjectStore("liteforms.credentials", { keyPath: "id" });
        store.createIndex("by-provider", "providerId");
      }
    }
  });

  return new IndexedDbCredentialRepository(db);
}

class IndexedDbCredentialRepository implements CredentialRepository {
  constructor(private readonly db: IDBPDatabase<LiteformsLocalDb>) {}

  list() {
    return this.db.getAll("liteforms.credentials");
  }

  get(id: string) {
    return this.db.get("liteforms.credentials", id);
  }

  async save(input: BrowserCredentialInput) {
    const now = new Date().toISOString();
    const credential: BrowserCredential = {
      ...input,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now
    };

    await this.db.put("liteforms.credentials", credential);
    return credential;
  }

  async update(
    id: string,
    input: Partial<Pick<BrowserCredential, "label" | "encryptedValue" | "kind">>
  ) {
    const existing = await this.get(id);

    if (!existing) {
      throw new Error(`Credential ${id} was not found`);
    }

    const credential: BrowserCredential = {
      ...existing,
      ...input,
      updatedAt: new Date().toISOString()
    };

    await this.db.put("liteforms.credentials", credential);
    return credential;
  }

  delete(id: string) {
    return this.db.delete("liteforms.credentials", id);
  }
}
