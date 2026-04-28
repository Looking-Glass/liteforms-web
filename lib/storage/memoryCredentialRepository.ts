import type { BrowserCredential, BrowserCredentialInput, CredentialRepository } from "./types";

export function createMemoryCredentialRepository(): CredentialRepository {
  const credentials = new Map<string, BrowserCredential>();
  let sequence = 0;

  return {
    async list() {
      return [...credentials.values()];
    },
    async get(id) {
      return credentials.get(id);
    },
    async save(input: BrowserCredentialInput) {
      const now = timestamp(sequence);
      const credential: BrowserCredential = {
        ...input,
        id: `cred_${++sequence}`,
        createdAt: now,
        updatedAt: now
      };

      credentials.set(credential.id, credential);
      return credential;
    },
    async update(id, input) {
      const existing = credentials.get(id);

      if (!existing) {
        throw new Error(`Credential ${id} was not found`);
      }

      const credential: BrowserCredential = {
        ...existing,
        ...input,
        updatedAt: timestamp(++sequence)
      };

      credentials.set(id, credential);
      return credential;
    },
    async delete(id) {
      credentials.delete(id);
    }
  };
}

function timestamp(offset: number) {
  return new Date(Date.UTC(2026, 0, 1, 0, 0, offset)).toISOString();
}
