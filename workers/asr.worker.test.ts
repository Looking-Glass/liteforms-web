import { describe, expect, it } from "vitest";
import { getTranscriptionOptions, isEnglishOnlyWhisperModel } from "./asr-helpers";
import type { AsrWorkerRequest } from "@/lib/speech";

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
