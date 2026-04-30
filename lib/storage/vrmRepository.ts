export type StoredVrm = {
  arrayBuffer: ArrayBuffer;
  fileName: string;
};

export type VrmRepository = {
  save(arrayBuffer: ArrayBuffer, fileName: string): Promise<void>;
  load(): Promise<StoredVrm | null>;
  clear(): Promise<void>;
};
