// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted to the top of the file, so mockGenerate must be defined
// with vi.hoisted so it is available when the factory runs.
const { mockGenerate } = vi.hoisted(() => ({
  mockGenerate: vi.fn().mockResolvedValue({
    sampling_rate: 24000,
    toWav: vi.fn().mockReturnValue(new ArrayBuffer(44))
  })
}));

vi.mock("kokoro-js", () => ({
  KokoroTTS: {
    from_pretrained: vi.fn().mockResolvedValue({ generate: mockGenerate })
  }
}));

// The worker registers its message handler on `self` (globalThis in jsdom).
// Importing it here causes the handler to register against the jsdom window.
import "./kokoro.worker";

describe("kokoro worker preload warm-up", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    postMessageSpy = vi.spyOn(self, "postMessage").mockImplementation(() => {});
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
  });

  it("calls generate once as a warm-up after preloading the model", async () => {
    self.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id: 1,
          type: "preload",
          payload: {
            provider: "kokoro",
            model: "onnx-community/Kokoro-82M-v1.0-ONNX",
            voice: "af_bella",
            dtype: "fp32",
            device: "webgpu",
            speed: 1.0
          }
        }
      })
    );

    await vi.waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, ok: true })
      );
    });

    expect(mockGenerate).toHaveBeenCalledTimes(1);
    expect(mockGenerate).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ voice: "af_bella" })
    );
  });

  it("completes preload successfully even if warm-up generate throws", async () => {
    mockGenerate.mockRejectedValueOnce(new Error("GPU not available"));

    self.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id: 2,
          type: "preload",
          payload: {
            provider: "kokoro",
            model: "onnx-community/Kokoro-82M-v1.0-ONNX",
            voice: "af_bella",
            dtype: "fp32",
            device: "webgpu",
            speed: 1.0
          }
        }
      })
    );

    await vi.waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 2, ok: true })
      );
    });
  });
});
