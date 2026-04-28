import { describe, expect, it } from "vitest";
import { buildVrmUploadRequest, validateVrmFile } from "./vrm-upload";

describe("VRM upload helpers", () => {
  it("validates VRM files before upload", () => {
    expect(validateVrmFile({ name: "avatar.vrm", size: 1024, type: "model/gltf-binary" })).toEqual({
      ok: true
    });
    expect(validateVrmFile({ name: "avatar.glb", size: 1024, type: "model/gltf-binary" }).ok).toBe(false);
  });

  it("builds the Liteforms presigned upload request", () => {
    expect(
      buildVrmUploadRequest({
        name: "avatar.vrm",
        size: 1024,
        type: "model/gltf-binary"
      })
    ).toEqual({
      name: "avatar.vrm",
      model_type: "VRM",
      contentType: "model/gltf-binary",
      fileSize: 1024
    });
  });
});
