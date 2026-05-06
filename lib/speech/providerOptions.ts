import type { AsrProviderId, TtsProviderId } from "./types";

export type SpeechProviderModelOption = { id: string; label: string };
export type SpeechProviderVoiceOption = { id: string; label: string };

export type TtsProviderOption = {
  id: TtsProviderId;
  label: string;
  defaultBaseUrl?: string;
  defaultModel?: string;
  defaultVoice?: string;
  /** Static model list → renders a <select>; absent → renders a <input>. */
  models?: SpeechProviderModelOption[];
  /** Static voice list → renders a <select>; absent → renders a <input> or nothing. */
  voices?: SpeechProviderVoiceOption[];
  needsCredential: boolean;
};

export type AsrProviderOption = {
  id: AsrProviderId;
  label: string;
  defaultBaseUrl?: string;
  defaultModel?: string;
  models?: SpeechProviderModelOption[];
  needsCredential: boolean;
};

export const TTS_PROVIDER_OPTIONS: TtsProviderOption[] = [
  {
    id: "kokoro",
    label: "Kokoro (local)",
    needsCredential: false
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    defaultBaseUrl: "https://api.elevenlabs.io",
    defaultModel: "eleven_multilingual_v2",
    defaultVoice: "Rachel",
    models: [
      { id: "eleven_v3", label: "Eleven v3" },
      { id: "eleven_multilingual_v2", label: "Eleven Multilingual v2" },
      { id: "eleven_turbo_v2_5", label: "Eleven Turbo v2.5" },
      { id: "eleven_monolingual_v1", label: "Eleven Monolingual v1" }
    ],
    // voices: dynamic (fetched from API via voice ID text input)
    needsCredential: true
  },
  {
    id: "deepgram",
    label: "Deepgram",
    defaultBaseUrl: "https://api.deepgram.com/v1",
    defaultVoice: "aura-asteria-en",
    // voice: dynamic text input
    needsCredential: true
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-mini-tts",
    defaultVoice: "coral",
    models: [
      { id: "gpt-4o-mini-tts", label: "GPT-4o Mini TTS" },
      { id: "tts-1", label: "TTS-1" },
      { id: "tts-1-hd", label: "TTS-1 HD" }
    ],
    voices: [
      { id: "alloy", label: "Alloy" },
      { id: "ash", label: "Ash" },
      { id: "ballad", label: "Ballad" },
      { id: "cedar", label: "Cedar" },
      { id: "coral", label: "Coral" },
      { id: "echo", label: "Echo" },
      { id: "fable", label: "Fable" },
      { id: "juniper", label: "Juniper" },
      { id: "marin", label: "Marin" },
      { id: "onyx", label: "Onyx" },
      { id: "nova", label: "Nova" },
      { id: "sage", label: "Sage" },
      { id: "shimmer", label: "Shimmer" },
      { id: "verse", label: "Verse" }
    ],
    needsCredential: true
  },
  {
    id: "google",
    label: "Google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
    defaultModel: "gemini-3.1-flash-tts-preview",
    defaultVoice: "Kore",
    models: [
      { id: "gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS" },
      { id: "gemini-2.5-flash-preview-tts", label: "Gemini 2.5 Flash TTS" },
      { id: "gemini-2.5-pro-preview-tts", label: "Gemini 2.5 Pro TTS" }
    ],
    voices: [
      { id: "Zephyr", label: "Zephyr" },
      { id: "Puck", label: "Puck" },
      { id: "Charon", label: "Charon" },
      { id: "Kore", label: "Kore" },
      { id: "Fenrir", label: "Fenrir" },
      { id: "Leda", label: "Leda" },
      { id: "Orus", label: "Orus" },
      { id: "Aoede", label: "Aoede" },
      { id: "Callirrhoe", label: "Callirrhoe" },
      { id: "Autonoe", label: "Autonoe" },
      { id: "Enceladus", label: "Enceladus" },
      { id: "Iapetus", label: "Iapetus" },
      { id: "Umbriel", label: "Umbriel" },
      { id: "Algieba", label: "Algieba" },
      { id: "Despina", label: "Despina" },
      { id: "Erinome", label: "Erinome" },
      { id: "Algenib", label: "Algenib" },
      { id: "Rasalgethi", label: "Rasalgethi" },
      { id: "Laomedeia", label: "Laomedeia" },
      { id: "Achernar", label: "Achernar" },
      { id: "Alnilam", label: "Alnilam" },
      { id: "Schedar", label: "Schedar" },
      { id: "Gacrux", label: "Gacrux" },
      { id: "Pulcherrima", label: "Pulcherrima" },
      { id: "Achird", label: "Achird" },
      { id: "Zubenelgenubi", label: "Zubenelgenubi" },
      { id: "Vindemiatrix", label: "Vindemiatrix" },
      { id: "Sadachbia", label: "Sadachbia" },
      { id: "Sadaltager", label: "Sadaltager" },
      { id: "Sulafat", label: "Sulafat" }
    ],
    needsCredential: true
  },
  {
    id: "xai",
    label: "xAI",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultVoice: "eve",
    voices: [
      { id: "eve", label: "Eve" },
      { id: "ara", label: "Ara" },
      { id: "rex", label: "Rex" },
      { id: "sal", label: "Sal" },
      { id: "leo", label: "Leo" },
      { id: "una", label: "Una" }
    ],
    needsCredential: true
  },
  {
    id: "deepinfra",
    label: "DeepInfra",
    defaultBaseUrl: "https://api.deepinfra.com/v1/openai",
    defaultModel: "hexgrad/Kokoro-82M",
    defaultVoice: "af_alloy",
    models: [
      { id: "hexgrad/Kokoro-82M", label: "Kokoro 82M" },
      { id: "ResembleAI/chatterbox-turbo", label: "Chatterbox Turbo" },
      { id: "sesame/csm-1b", label: "CSM 1B" },
      { id: "Qwen/Qwen3-TTS", label: "Qwen3 TTS" }
    ],
    needsCredential: true
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "hexgrad/kokoro-82m",
    defaultVoice: "af_alloy",
    models: [
      { id: "hexgrad/kokoro-82m", label: "Kokoro 82M" },
      { id: "google/gemini-3.1-flash-tts-preview", label: "Gemini 3.1 Flash TTS" },
      { id: "mistralai/voxtral-mini-tts-2603", label: "Voxtral Mini TTS" },
      { id: "elevenlabs/eleven-turbo-v2", label: "ElevenLabs Turbo v2" }
    ],
    needsCredential: true
  },
  {
    id: "inworld",
    label: "Inworld",
    defaultBaseUrl: "https://api.inworld.ai",
    defaultModel: "inworld-tts-1.5-max",
    defaultVoice: "Sarah",
    models: [
      { id: "inworld-tts-1.5-max", label: "TTS 1.5 Max" },
      { id: "inworld-tts-1.5-mini", label: "TTS 1.5 Mini" },
      { id: "inworld-tts-1-max", label: "TTS 1 Max" },
      { id: "inworld-tts-1", label: "TTS 1" }
    ],
    needsCredential: true
  },
  {
    id: "minimax",
    label: "MiniMax",
    defaultBaseUrl: "https://api.minimax.io",
    defaultModel: "speech-2.8-hd",
    defaultVoice: "English_expressive_narrator",
    models: [
      { id: "speech-2.8-hd", label: "Speech 2.8 HD" },
      { id: "speech-2.8-turbo", label: "Speech 2.8 Turbo" },
      { id: "speech-2.6-hd", label: "Speech 2.6 HD" },
      { id: "speech-2.6-turbo", label: "Speech 2.6 Turbo" },
      { id: "speech-02-hd", label: "Speech 02 HD" },
      { id: "speech-02-turbo", label: "Speech 02 Turbo" },
      { id: "speech-01-hd", label: "Speech 01 HD" },
      { id: "speech-01-turbo", label: "Speech 01 Turbo" },
      { id: "speech-01-240228", label: "Speech 01 Feb 2024" }
    ],
    voices: [
      { id: "English_expressive_narrator", label: "English Narrator" },
      { id: "Chinese (Mandarin)_Warm_Girl", label: "Mandarin Warm Girl" },
      { id: "Chinese (Mandarin)_Lively_Girl", label: "Mandarin Lively Girl" },
      { id: "Chinese (Mandarin)_Gentle_Boy", label: "Mandarin Gentle Boy" },
      { id: "Chinese (Mandarin)_Steady_Boy", label: "Mandarin Steady Boy" }
    ],
    needsCredential: true
  },
  {
    id: "gradium",
    label: "Gradium",
    defaultBaseUrl: "https://api.gradium.ai",
    defaultVoice: "YTpq7expH9539ERJ",
    voices: [
      { id: "YTpq7expH9539ERJ", label: "Emma" },
      { id: "LFZvm12tW_z0xfGo", label: "Kent" },
      { id: "Eu9iL_CYe8N-Gkx_", label: "Tiffany" },
      { id: "2H4HY2CBNyJHBCrP", label: "Christina" },
      { id: "jtEKaLYNn6iif5PR", label: "Sydney" },
      { id: "KWJiFWu2O9nMPYcR", label: "John" },
      { id: "3jUdJyOi9pgbxBTK", label: "Arthur" }
    ],
    needsCredential: true
  },
  {
    id: "vydra",
    label: "Vydra",
    defaultBaseUrl: "https://www.vydra.ai/api/v1",
    defaultModel: "elevenlabs/tts",
    defaultVoice: "21m00Tcm4TlvDq8ikWAM",
    models: [{ id: "elevenlabs/tts", label: "ElevenLabs TTS" }],
    voices: [{ id: "21m00Tcm4TlvDq8ikWAM", label: "Rachel" }],
    needsCredential: true
  },
  {
    id: "xiaomi",
    label: "Xiaomi MiMo",
    defaultBaseUrl: "https://api.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5-tts",
    defaultVoice: "mimo_default",
    models: [
      { id: "mimo-v2.5-tts", label: "MiMo v2.5 TTS" },
      { id: "mimo-v2-tts", label: "MiMo v2 TTS" }
    ],
    voices: [
      { id: "mimo_default", label: "Default" },
      { id: "default_zh", label: "Default (Chinese)" },
      { id: "default_en", label: "Default (English)" },
      { id: "Mia", label: "Mia" },
      { id: "Chloe", label: "Chloe" },
      { id: "Milo", label: "Milo" },
      { id: "Dean", label: "Dean" }
    ],
    needsCredential: true
  },
  {
    id: "azure-speech",
    label: "Azure Speech",
    defaultBaseUrl: "https://eastus.tts.speech.microsoft.com",
    defaultVoice: "en-US-JennyNeural",
    // voices: dynamic (fetched from Azure API) → text input
    needsCredential: true
  },
  {
    id: "microsoft",
    label: "Microsoft Edge TTS",
    defaultBaseUrl: "http://localhost:5000",
    defaultVoice: "en-US-MichelleNeural",
    // voices: dynamic → text input; uses proxy endpoint
    needsCredential: false
  },
  {
    id: "volcengine",
    label: "Volcengine",
    defaultBaseUrl: "https://voice.ap-southeast-1.bytepluses.com",
    defaultVoice: "en_female_anna_mars_bigtts",
    voices: [
      { id: "en_female_anna_mars_bigtts", label: "Anna (EN)" },
      { id: "en_male_adam_mars_bigtts", label: "Adam (EN)" },
      { id: "en_female_sarah_mars_bigtts", label: "Sarah (EN)" },
      { id: "en_male_smith_mars_bigtts", label: "Smith (EN)" },
      { id: "zh_female_cancan_mars_bigtts", label: "Cancan (ZH)" },
      { id: "zh_female_qingxinnvsheng_mars_bigtts", label: "Qingxin (ZH)" },
      { id: "zh_female_linjia_mars_bigtts", label: "Linjia (ZH)" },
      { id: "zh_male_wennuanahu_moon_bigtts", label: "Wennuan (ZH)" },
      { id: "zh_male_shaonianzixin_moon_bigtts", label: "Shaonian (ZH)" },
      { id: "zh_female_shuangkuaisisi_moon_bigtts", label: "Shuangkuai (ZH)" }
    ],
    needsCredential: true
  }
];

export const STT_PROVIDER_OPTIONS: AsrProviderOption[] = [
  {
    id: "distil-whisper",
    label: "Distil-Whisper (local)",
    needsCredential: false
  },
  {
    id: "deepgram",
    label: "Deepgram",
    defaultBaseUrl: "https://api.deepgram.com/v1",
    defaultModel: "nova-3",
    needsCredential: true
  },
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    defaultBaseUrl: "https://api.elevenlabs.io/v1",
    defaultModel: "scribe_v2",
    models: [
      { id: "scribe_v2", label: "Scribe v2" },
      { id: "scribe_v1", label: "Scribe v1" }
    ],
    needsCredential: true
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4o-transcribe",
    models: [{ id: "gpt-4o-transcribe", label: "GPT-4o Transcribe" }],
    needsCredential: true
  },
  {
    id: "google",
    label: "Google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta",
    defaultModel: "gemini-3-flash-preview",
    models: [{ id: "gemini-3-flash-preview", label: "Gemini 3 Flash Preview" }],
    needsCredential: true
  },
  {
    id: "xai",
    label: "xAI",
    defaultBaseUrl: "https://api.x.ai/v1",
    defaultModel: "grok-stt",
    models: [{ id: "grok-stt", label: "Grok STT" }],
    needsCredential: true
  },
  {
    id: "mistral",
    label: "Mistral",
    defaultBaseUrl: "https://api.mistral.ai/v1",
    defaultModel: "voxtral-mini-latest",
    models: [{ id: "voxtral-mini-latest", label: "Voxtral Mini" }],
    needsCredential: true
  }
];

/** Provider IDs (TTS + STT) that require an API credential in the browser. */
export const SPEECH_CREDENTIAL_PROVIDER_IDS: string[] = [
  ...TTS_PROVIDER_OPTIONS.filter((p) => p.needsCredential).map((p) => p.id),
  ...STT_PROVIDER_OPTIONS.filter((p) => p.needsCredential).map((p) => p.id)
].filter((id, i, arr) => arr.indexOf(id) === i); // deduplicate
