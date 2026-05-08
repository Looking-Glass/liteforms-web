import type { TtsResult } from "./types";
import { createRmsLipSyncFrame, mapWordTimingsToVisemes } from "./lipSync";
import type { RmsLipSyncFrame, VisemeFrame } from "./lipSync";

type PlayTtsOptions = {
  audioContextFactory?: () => AudioContext;
  onLipSyncFrame?: (frame: VisemeFrame | RmsLipSyncFrame) => void;
  clearLipSync?: () => void;
  lipSyncOffsetMs?: number;
};

const defaultLipSyncOffsetMs = 90;
const maxMeasuredOutputLatencyMs = 180;
const audioStartLeadSeconds = 0.02;

export async function playTtsResult(
  result: TtsResult,
  optionsOrAudioContextFactory: PlayTtsOptions | (() => AudioContext) = {}
) {
  const options =
    typeof optionsOrAudioContextFactory === "function"
      ? { audioContextFactory: optionsOrAudioContextFactory }
      : optionsOrAudioContextFactory;
  const audioContextFactory = options.audioContextFactory ?? (() => new AudioContext());
  const context = audioContextFactory();
  if (result.mimeType === "audio/pcm") {
    await playPcm16Mono(result, context, options);
    return;
  }

  const buffer = await context.decodeAudioData(result.audio.slice(0));
  const source = context.createBufferSource();
  source.buffer = buffer;
  await playSourceWithLipSync(source, context, result, options);
}

async function playPcm16Mono(result: TtsResult, context: AudioContext, options: PlayTtsOptions) {
  const sampleRate = result.sampleRate ?? 24000;
  const pcm = new Int16Array(result.audio);
  const buffer = context.createBuffer(1, pcm.length, sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < pcm.length; index += 1) {
    channel[index] = pcm[index] / 32768;
  }
  const source = context.createBufferSource();
  source.buffer = buffer;
  await playSourceWithLipSync(source, context, result, options);
}

async function playSourceWithLipSync(source: AudioBufferSourceNode, context: AudioContext, result: TtsResult, options: PlayTtsOptions) {
  let stopRmsFallback: (() => void) | undefined;
  const playbackStartTime = (context.currentTime ?? 0) + audioStartLeadSeconds;

  if (result.words?.length) {
    stopRmsFallback = connectWordTimingLipSync(source, context, result, options, playbackStartTime);
  } else {
    stopRmsFallback = connectRmsFallback(source, context, result, options.onLipSyncFrame);
  }

  await playSource(source, playbackStartTime);
  stopRmsFallback?.();
  options.clearLipSync?.();
}

function connectWordTimingLipSync(
  source: AudioBufferSourceNode,
  context: AudioContext,
  result: TtsResult,
  options: PlayTtsOptions,
  playbackStartTime: number
) {
  if (!options.onLipSyncFrame) {
    source.connect(context.destination);
    return undefined;
  }

  const analyser = context.createAnalyser();
  const samples = new Uint8Array(analyser.fftSize);
  const frames = mapWordTimingsToVisemes(result.words ?? []);
  const lipSyncOffsetSeconds = resolveLipSyncOffsetMs(context, options.lipSyncOffsetMs) / 1000;
  let active = true;

  source.connect(analyser);
  analyser.connect(context.destination);

  const update = () => {
    if (!active) {
      return;
    }

    analyser.getByteTimeDomainData(samples);
    const playbackTime = context.currentTime - playbackStartTime - lipSyncOffsetSeconds;
    const activeFrame = getActiveVisemeFrame(frames, playbackTime);
    const rms = calculateRms(samples);

    if (activeFrame) {
      options.onLipSyncFrame?.({
        ...activeFrame,
        weight: calculateVisemeWeight(rms, result.lipSyncGain, result.lipSyncMaxWeight)
      });
    } else if (rms > 0.015) {
      options.onLipSyncFrame?.(
        createRmsLipSyncFrame(calculateVisemeWeight(rms, result.lipSyncGain, result.lipSyncMaxWeight), getRmsLipSyncFrameOptions(result))
      );
    }

    window.requestAnimationFrame(update);
  };

  window.requestAnimationFrame(update);

  return () => {
    active = false;
    analyser.disconnect();
  };
}

function connectRmsFallback(
  source: AudioBufferSourceNode,
  context: AudioContext,
  result: Pick<TtsResult, "lipSyncGain" | "lipSyncMaxWeight" | "lipSyncPreferMorphTarget">,
  onLipSyncFrame?: (frame: RmsLipSyncFrame) => void
) {
  if (!onLipSyncFrame) {
    source.connect(context.destination);
    return undefined;
  }

  const analyser = context.createAnalyser();
  const samples = new Uint8Array(analyser.fftSize);
  let active = true;

  source.connect(analyser);
  analyser.connect(context.destination);

  const update = () => {
    if (!active) {
      return;
    }

    analyser.getByteTimeDomainData(samples);
    onLipSyncFrame(
      createRmsLipSyncFrame(
        calculateVisemeWeight(calculateRms(samples), result.lipSyncGain, result.lipSyncMaxWeight),
        getRmsLipSyncFrameOptions(result)
      )
    );
    window.requestAnimationFrame(update);
  };

  update();

  return () => {
    active = false;
    analyser.disconnect();
  };
}

function calculateRms(samples: Uint8Array) {
  let sum = 0;
  for (const sample of samples) {
    const centered = (sample - 128) / 128;
    sum += centered * centered;
  }
  return Math.sqrt(sum / samples.length);
}

function calculateVisemeWeight(rms: number, gain = 1, maxWeight = 1) {
  return clamp((rms * gain - 0.01) / 0.18, 0, maxWeight);
}

function getRmsLipSyncFrameOptions(result: Pick<TtsResult, "lipSyncMaxWeight" | "lipSyncPreferMorphTarget">) {
  return {
    maxWeight: result.lipSyncMaxWeight,
    preferMorphTarget: result.lipSyncPreferMorphTarget
  };
}

function getActiveVisemeFrame(frames: VisemeFrame[], playbackTime: number) {
  return frames.find((frame) => playbackTime >= frame.start && playbackTime <= frame.end) ?? null;
}

function playSource(source: AudioBufferSourceNode, startTime: number) {
  return new Promise<void>((resolve) => {
    source.addEventListener("ended", () => resolve(), { once: true });
    source.start(startTime);
  });
}

function resolveLipSyncOffsetMs(context: AudioContext, explicitOffsetMs: number | undefined) {
  if (explicitOffsetMs !== undefined) {
    return explicitOffsetMs;
  }

  const latencyContext = context as AudioContext & { outputLatency?: number };
  const measuredLatencyMs = Math.max(latencyContext.outputLatency ?? 0, context.baseLatency ?? 0) * 1000;
  return Math.max(defaultLipSyncOffsetMs, Math.min(measuredLatencyMs, maxMeasuredOutputLatencyMs));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
