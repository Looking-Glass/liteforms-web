// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTranscriptionOptions, isEnglishOnlyWhisperModel } from "./asr-helpers";
import type { AsrWorkerRequest } from "@/lib/speech";

const { mockPipeline, mockTranscribe } = vi.hoisted(() => ({
  mockTranscribe: vi.fn().mockResolvedValue({ text: "" }),
  mockPipeline: vi.fn()
}));

vi.mock("@huggingface/transformers", () => ({
  env: {},
  pipeline: mockPipeline
}));

import "./asr.worker";

const baseRequest: AsrWorkerRequest = {
  provider: "distil-whisper",
  model: "onnx-community/distil-small.en",
  device: "webgpu",
  dtype: "q4",
  language: "en",
  autoSend: false,
  audio: new Float32Array([0])
};

describe("ASR worker helpers", () => {
  it("omits language and task for English-only Whisper models", () => {
    expect(isEnglishOnlyWhisperModel("onnx-community/distil-small.en")).toBe(true);
    expect(getTranscriptionOptions(baseRequest)).toEqual({});
  });

  it("passes language and transcription task for multilingual Whisper models", () => {
    expect(
      getTranscriptionOptions({
        ...baseRequest,
        model: "onnx-community/whisper-small"
      })
    ).toEqual({ language: "en", task: "transcribe" });
  });
});

describe("ASR worker preload warm-up", () => {
  let postMessageSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.mockResolvedValue(mockTranscribe);
    mockTranscribe.mockResolvedValue({ text: "" });
    postMessageSpy = vi.spyOn(self, "postMessage").mockImplementation(() => {});
  });

  afterEach(() => {
    postMessageSpy.mockRestore();
  });

  it("runs one silent transcription after preloading the model", async () => {
    self.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id: 1,
          type: "preload",
          payload: {
            provider: "distil-whisper",
            model: "onnx-community/distil-small.en",
            device: "webgpu",
            dtype: "q4",
            language: "en",
            autoSend: false
          }
        }
      })
    );

    await vi.waitFor(() => {
      expect(postMessageSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, ok: true })
      );
    });

    expect(mockTranscribe).toHaveBeenCalledTimes(1);
    expect(mockTranscribe).toHaveBeenCalledWith(expect.any(Float32Array), {});
  });

  it("completes preload successfully even if warm-up transcription throws", async () => {
    mockTranscribe.mockRejectedValueOnce(new Error("GPU not ready"));

    self.dispatchEvent(
      new MessageEvent("message", {
        data: {
          id: 2,
          type: "preload",
          payload: {
            provider: "distil-whisper",
            model: "onnx-community/distil-small.en",
            device: "webgpu",
            dtype: "q4",
            language: "en",
            autoSend: false
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
