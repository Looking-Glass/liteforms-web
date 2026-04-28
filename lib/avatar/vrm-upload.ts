import type { ModelUploadRequest } from "@/lib/liteforms-api/types";

const maxVrmFileSize = 75 * 1024 * 1024;

type VrmFileLike = {
  name: string;
  size: number;
  type?: string;
};

export type VrmValidationResult = { ok: true } | { ok: false; reason: string };

export function validateVrmFile(file: VrmFileLike): VrmValidationResult {
  if (!file.name.toLowerCase().endsWith(".vrm")) {
    return { ok: false, reason: "Select a .vrm file." };
  }

  if (file.size <= 0) {
    return { ok: false, reason: "The selected VRM file is empty." };
  }

  if (file.size > maxVrmFileSize) {
    return { ok: false, reason: "The selected VRM file is larger than 75 MB." };
  }

  return { ok: true };
}

export function buildVrmUploadRequest(file: VrmFileLike): ModelUploadRequest {
  const validation = validateVrmFile(file);

  if (!validation.ok) {
    throw new Error(validation.reason);
  }

  return {
    name: file.name,
    model_type: "VRM",
    contentType: file.type || "model/gltf-binary",
    fileSize: file.size
  };
}
