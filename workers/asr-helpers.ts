import type { AsrWorkerRequest } from "@/lib/speech";

export function getTranscriptionOptions(request: AsrWorkerRequest) {
  if (isEnglishOnlyWhisperModel(request.model)) {
    return {};
  }

  return {
    language: request.language,
    task: "transcribe" as const
  };
}

export function isEnglishOnlyWhisperModel(model: string) {
  return /\.en($|[-_/])/i.test(model) || /distil-small\.en/i.test(model);
}
