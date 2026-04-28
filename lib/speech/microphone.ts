import type { AsrAdapter, AsrResult } from "./types";

export type TranscriptCallbacks = {
  onInterim?(transcript: string): void;
  onFinal?(transcript: string): void;
};

export type RecorderFactory = (stream: MediaStream) => MediaRecorder;

export async function captureMicrophoneBlob(mediaDevices: Pick<MediaDevices, "getUserMedia"> = navigator.mediaDevices, recorderFactory: RecorderFactory = (stream) => new MediaRecorder(stream)) {
  const stream = await mediaDevices.getUserMedia({ audio: true });
  const recorder = recorderFactory(stream);
  const chunks: BlobPart[] = [];

  return new Promise<Blob>((resolve, reject) => {
    recorder.addEventListener("dataavailable", (event) => {
      const data = (event as BlobEvent).data;
      if (data.size > 0) {
        chunks.push(data);
      }
    });
    recorder.addEventListener("stop", () => {
      stream.getTracks().forEach((track) => track.stop());
      resolve(new Blob(chunks, { type: recorder.mimeType || "audio/webm" }));
    });
    recorder.addEventListener("error", (event) => {
      stream.getTracks().forEach((track) => track.stop());
      reject(new Error((event as ErrorEvent).message));
    });
    recorder.start();
  });
}

export async function transcribeMicrophoneOnce(adapter: AsrAdapter, callbacks: TranscriptCallbacks = {}): Promise<AsrResult> {
  const audio = await captureMicrophoneBlob();
  callbacks.onInterim?.("Transcribing...");
  const result = await adapter.transcribe(audio);
  callbacks.onFinal?.(result.text);
  return result;
}
