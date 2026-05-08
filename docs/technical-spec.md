# Liteforms Technical Specification

Status: draft v0.2  
Target stack: Next.js, React, TypeScript, Three.js, Vercel-compatible backend  
Workspace: `Liteforms/` under this repository

## 1. Product Goal

Liteforms is a browser-based avatar companion app. A user can chat with preset characters without signing in. A user signs in to create or import a 3D character, configure the character's identity, personality, voice, and model provider, then talk to the character through text or microphone input. The character responds through streamed local or user-connected LLM output, local or hosted TTS, and RPM/VRM facial/body animation in a Three.js scene.

The MVP must run primarily in the user's browser. LLM requests must not route through a Liteforms proxy server for MVP. Server-side storage is used for accounts, character records, avatar assets, and post-MVP knowledge features. User LLM, TTS, and STT provider credentials are browser-local by default and must not be stored server-side in MVP.

## 2. Reference Material

Available local references:

- `AI-Avatar/`: Unity implementation of Liteforms. Important references include Looking Glass/Liteforms API clients, character/model/document persistence, Ready Player Me avatar creation, VRM runtime loading, provider-oriented LLM/TTS/STT interfaces, local Kokoro and Whisper sidecars, RAG through document fragments, and OpenClaw/Codex/Claude CLI connectors.
- `openclaw/`: provider connector architecture, model auth concepts, OpenAI/OpenRouter/Ollama/LM Studio/Codex provider implementations, TTS and STT provider examples, memory/RAG implementation. Where provider behavior conflicts across AI-Avatar, OpenRouter, Ollama, LM Studio, Codex, and local Liteforms assumptions, OpenClaw is the implementation gold standard.
- `kokoro/kokoro.js/`: browser-local Kokoro TTS implementation using Transformers.js / ONNX.
- `faster-whisper/`: Python/CTranslate2 faster-whisper implementation, used as a behavior reference only. It is not directly browser-runnable. MVP browser STT uses Distil-Whisper ONNX/WebGPU.

AI-Avatar implementation facts:

- User auth for hosted/internal builds is provider-specific. Unity uses device-code/webview login and refresh-token flows, then calls the Liteforms API with `Authorization: Bearer <accessToken>`.
- User account/profile data can come from `GET /api/liteforms/usage`-style generated client calls and includes account email, `rpmId`, `rpmToken`, Liteforms characters, and historical usage/analytics. MVP must not gate usage by Liteforms entitlement or tier.
- Characters are stored through Liteforms API character endpoints, not only local files. Character records include `name`, `description`, `pronouns`, `sceneId`, `voice`, optional `documents` for post-MVP knowledge compatibility, optional `avatar_id`, and `environmentID`.
- Custom avatars/models are stored through Liteforms model endpoints. VRM upload uses a presigned upload flow: request `models/upload`, upload file to returned `uploadUrl` with returned form fields, then update the model record with URL/upload hash/file metadata and avatar calibration settings.
- Ready Player Me avatars are saved by RPM avatar ID and user RPM token. AI-Avatar creates or updates model records with the RPM avatar ID in the URL field.
- Post-MVP knowledge can reuse AI-Avatar's server document + fragment-search flow. Unity creates/updates documents, links document IDs to characters, and queries `/api/fragments/searchByPrompt` using embedding model `text-embedding-3-small`.
- Speech and LLM are provider-oriented. Unity has `ILLMProvider`, `ITTSProvider`, and `ISTTProvider` interfaces and provider implementations for OpenAI-compatible, Anthropic, OpenClaw WebSocket, Codex CLI OAuth, Claude Code OAuth, Kokoro, ElevenLabs, Deepgram, and Whisper/faster-whisper sidecars.

External implementation references checked on 2026-04-25:

- Ready Player Me Avatar Creator supports iframe/WebView integration with `postMessage` events including `v1.avatar.exported`, and avatar URLs resolve to GLB assets.
- Ready Player Me REST API serves 3D avatars as GLB; public GET avatar endpoints do not require auth, while other endpoints require API key.
- Ready Player Me avatars can include facial morph targets for ARKit and Oculus/OVR LipSync visemes. Use RPM's native GLB morph targets for RPM facial animation rather than converting RPM avatars to VRM.
- `@pixiv/three-vrm` provides VRM 0.0 and 1.0 support modules, including expression, spring bone, MToon, node constraint, and VRM animation packages.
- `kokoro-js` supports 100% local browser TTS through Transformers.js with `wasm` and `webgpu` device options.
- Transformers.js supports WebGPU model execution and Whisper ASR examples.
- OpenAI states ChatGPT and API billing are separate. ChatGPT subscription support should therefore be treated as a ChatGPT/Codex-compatible connector path, implemented similarly to OpenClaw's approach and the Claude Code OAuth configuration rather than as a standard OpenAI API-key path.
- Community Gemma 4 WebGPU guidance, checked on 2026-04-25, describes running `onnx-community/gemma-4-e2b-it-ONNX` through Transformers.js/WebGPU with INT4 downloads around 300 MB and first-run browser caching. Verify exact upstream model availability and licensing before implementation.

## 3. MVP Requirements

### 3.1 Required MVP Capabilities

- Preset character chat without login.
- User accounts and login for character creation, editing, and persistence.
- Saved custom character profiles for authenticated users.
- Ready Player Me avatar creation through embedded Avatar Creator.
- Ready Player Me avatar import/export and backend storage of exported GLB assets.
- VRM 0.0 and 1.0 file import.
- Three.js avatar renderer.
- RPM and VRM rendering with expressions, lip sync, humanoid retargeting, and animation support.
- VRM spring bone support for imported VRM avatars.
- Character settings:
  - name
  - pronouns
  - personality/system prompt
  - voice provider and voice settings
  - STT provider settings
  - selected LLM provider/model/endpoint
- LLM providers:
  - Browser-local Gemma 4 E2B INT4 via ONNX/WebGPU as default brain
  - OpenAI API
  - ChatGPT subscription connector, implemented using the same pattern OpenClaw uses for Codex/ChatGPT access
  - Anthropic API
  - Anthropic/Claude subscription connector, implemented using the same pattern OpenClaw uses for subscription access and similar to Claude Code configuration
  - OpenRouter
  - Ollama
  - LM Studio
  - OpenClaw Gateway / Codex-compatible provider surface
- Text input box for chat.
- Local browser TTS using Kokoro by default.
- Local browser STT using Distil-Whisper ONNX/WebGPU by default; faster-whisper is a behavior reference, not a hard requirement.
- Optional hosted TTS providers: ElevenLabs and Deepgram.
- Optional hosted STT providers: Deepgram and ElevenLabs.
- Browser-local credential storage for provider API keys/tokens.

### 3.2 Explicit Non-MVP Items

- LookingGlass/holographic rendering.
- Server-side proxying for local model endpoints. Direct browser-to-local endpoint calls are MVP behavior.
- Full team/workspace administration.
- Payment handling.
- Mobile app packaging.
- AMD/Intel optimization beyond graceful fallback.
- Server-side storage of user LLM/TTS/STT credentials.
- Liteforms entitlement/tier gating.
- MVP RAG and character knowledge retrieval.
- Server-side Liteforms proxying for LLM requests.

## 4. Architecture

### 4.1 Application Layout

Proposed folder structure:

```text
Liteforms/
  app/
    (auth)/
      login/page.tsx
    characters/
      page.tsx
      new/page.tsx
      [characterId]/page.tsx
    api/
      auth/[...nextauth]/route.ts
      characters/route.ts
      characters/[characterId]/route.ts
      uploads/avatar/route.ts
      rpm/token/route.ts
  components/
    avatar/
    chat/
    character-editor/
    providers/
    settings/
  lib/
    auth/
    db/
    llm/
    rendering/
    rpm/
    speech/
    storage/
    workers/
  public/
    models/
      kokoro/
      asr/
  workers/
    kokoro.worker.ts
    asr.worker.ts
  docs/
    technical-spec.md
```

### 4.2 Runtime Boundaries

- Browser:
  - Three.js render loop.
  - VRM loading and animation.
  - LLM provider calls for API-key and local endpoints.
  - Streaming response parsing.
  - Kokoro ONNX inference.
  - Local ASR ONNX inference.
  - Audio capture, playback, lip sync analysis, and chat UI state.
  - Browser-local encrypted or private IndexedDB storage for provider credentials.
- Next.js server/API routes:
  - Account auth session handling.
  - Character CRUD.
  - Avatar asset upload/download metadata.
  - Ready Player Me server-only calls requiring app API key, if needed.
  - Post-MVP knowledge document APIs.
- Database/storage:
  - User profile records.
  - Character records.
  - Avatar asset metadata.
  - Post-MVP knowledge document metadata and chunks.
  - No MVP provider API keys.

## 5. Backend and Auth

### 5.1 Backend Strategy

Liteforms Web must use a configured account identity as the canonical MVP identity for hosted builds. AI-Avatar calls the Liteforms API with bearer access tokens. A user who can log in to AI-Avatar must be able to log in to Liteforms Web with the same account when that integration is configured.

MVP backend modes:

- Preferred: use the existing Looking Glass/Liteforms API directly from Next.js server routes.
- Acceptable fallback: implement a web-owned data layer only where existing API gaps block the MVP, while preserving compatible user identity fields.
- Do not add a hosted auth provider for MVP unless there is a deliberate integration project.

### 5.2 Auth Requirements

- Use the configured hosted identity provider in the Next.js app.
- Store hosted auth sessions in secure HTTP-only cookies.
- Server routes must be able to retrieve a valid access token for the existing Liteforms API.
- Support refresh-token/session renewal equivalent to AI-Avatar's refresh flow.
- Expose a typed `LiteformsApiClient` for server calls.
- Account profile must include:
  - Hosted auth subject / user id.
  - email.
  - display name.
  - RPM ID and RPM token if present.
- The web app can call existing account/usage endpoints after login to hydrate RPM data, existing characters, and analytics data. Do not use usage fields for MVP gating.

### 5.3 API Compatibility Layer

Implement a `lib/liteforms-api/` client that mirrors the Unity-generated client surface but uses TypeScript types:

```text
lib/liteforms-api/
  client.ts
  auth.ts
  account.ts
  characters.ts
  models.ts
  rpm.ts
  types.ts
```

Required API methods:

- `getAccountUsage()`: equivalent to Unity `LiteformsUser.GetLiteformsUsage()`.
  - Use for account hydration and analytics only.
  - Do not use for entitlement/tier gating or request limits in MVP.
- `getCharacters()`: hydrate existing `LiteformsCharacters`.
- `createCharacter(body)`.
- `updateCharacter(id, body)`.
- `deleteCharacter(id)`.
- `createModel(body)`.
- `readModel(id)`.
- `updateModel(id, body)`.
- `deleteModel(id)`.
- `requestModelUpload(body)`.
- `updateUserRpmId({ id, token })`.

Post-MVP RAG methods can add `documents.ts`, `fragments.ts`, document CRUD, and `searchFragmentsByPrompt(...)` when knowledge returns to scope.

All browser calls to Liteforms API should go through Next.js server routes so hosted access tokens are not exposed unnecessarily beyond normal authenticated browser session handling.

### 5.4 Credential Storage

Provider credentials are browser-only in MVP:

- Store API keys/tokens in IndexedDB under `liteforms.credentials`.
- Encrypt with Web Crypto when a passphrase is configured.
- If no passphrase is configured, store as private browser data with a clear warning in settings.
- Never send these credentials to Liteforms backend in MVP. Provider requests are made locally from the browser or through a user-selected non-Liteforms connector.

Credential record:

```ts
type BrowserCredential = {
  id: string;
  providerId: string;
  label: string;
  kind: "api_key" | "oauth_token" | "local_placeholder";
  encryptedValue: string;
  createdAt: string;
  updatedAt: string;
};
```

## 6. Data Model

### 6.1 Source of Truth

The source of truth for MVP user accounts, characters, custom avatars/models, and analytics/account usage metadata is the existing Liteforms API used by AI-Avatar. Liteforms Web should define TypeScript DTOs that match that API and only add web-local tables if the API is missing a required field.

### 6.2 Core DTOs

```ts
type LiteformsAccount = {
  id: string;
  email: string;
  rpmId?: string;
  rpmToken?: string;
  liteformsCharacters: LiteformsCharacter[];
  analytics?: {
    usage?: unknown;
  };
};

type LiteformsCharacter = {
  id: number;
  name: string;
  description: string;
  pronouns: "HE" | "SHE" | "THEY";
  sceneId: string;
  voice: LiteformsVoice;
  avatar_id?: number;
  environmentID?: string;
};

type LiteformsVoice = {
  languageTag?: string;
  voiceName?: string;
  speakingStyle?: string;
  pitch?: string;
  rate?: string;
};

type LiteformsModel = {
  id: number;
  name: string;
  url: string;
  model_type: "VRM" | "RPM" | string;
  upload_hash?: string;
  file_size?: number;
  scale?: number;
  armSpacing?: number;
  legSpacing?: number;
  rootHeight?: number;
  animations?: Record<string, AnimationSetting[]>;
};

type AnimationSetting = {
  name: string;
  frequency: number;
  intensity: number;
};

// Documents/fragments are post-MVP. Keep matching DTOs near the API client when RAG returns.
```

### 6.3 Web-Local Data

Browser-only data:

- Provider credentials.
- Local LLM/TTS/STT endpoint presets.
- Downloaded ONNX model cache metadata.
- UI preferences.

IndexedDB stores:

```text
liteforms.credentials
liteforms.localProviderPresets
liteforms.modelCache
liteforms.uiPreferences
```

### 6.4 Optional Web-Owned Tables

Only add these if the existing Liteforms API cannot store the field:

- `web_character_settings`: per-character web-only provider defaults.
- `web_model_cache`: cached asset metadata for faster loading.

These records must key by the existing Liteforms API IDs, not independent UUIDs, so Unity and Web can continue to refer to the same characters/models.

## 7. Character Creation and Avatar Import

### 7.1 Ready Player Me Flow

UX:

1. User clicks `New character`.
2. User chooses `Create with Ready Player Me`.
3. App opens RPM Avatar Creator in an iframe using the configured RPM subdomain and frame API.
   - MVP assumption: iframe integration is acceptable if it supports required defaults, usable branding/styling options, and reliable export events.
   - Implementation must verify whether RPM can preconfigure avatar defaults and theme/styling through the subdomain/configuration APIs. If styling control is too limited, keep iframe for MVP and document the constraints in the UI.
4. If the user already has `rpmId` and `rpmToken` from the Liteforms account, restore the RPM session where the web RPM API supports it.
5. User creates an avatar from photo or manual customization.
6. On export/save, app receives RPM avatar ID and GLB URL.
7. App persists RPM account ID/token through the existing `user/rpm` Liteforms API equivalent when available.
8. App creates or updates a Liteforms model record using the RPM avatar ID as the model URL, matching AI-Avatar `CreateOrUpdateRPM`.
9. App links the model `id` to the Liteforms character `avatar_id`.
10. User continues to identity/personality/provider/voice setup.

Implementation:

- `lib/rpm/frame-api.ts`: event subscription and message validation.
- `components/avatar/ReadyPlayerMeCreator.tsx`: iframe wrapper.
- `app/api/rpm/session/route.ts`: authenticated RPM session update/restore through Liteforms API.
- `app/api/models/route.ts`: create/update Liteforms model records.
- `app/api/characters/[characterId]/route.ts`: link `avatar_id`.

Compatibility:

- Preserve the AI-Avatar model fields: `name`, `url`, `scale`, `armSpacing`, `legSpacing`, `rootHeight`, and `animations`.
- RPM model `url` should store the RPM avatar ID unless the existing API has a newer dedicated RPM field.
- A derived GLB URL may be cached for rendering, but it should not replace the canonical RPM avatar ID record.
- Do not convert RPM GLB avatars to VRM. AI-Avatar did not do this, and RPM already provides the facial morph targets needed for web facial animation when requested.
- Request/download RPM GLB avatars with the morph targets required for facial animation:
  - Oculus/OVR LipSync visemes for TTS-driven mouth shapes.
  - ARKit-compatible blend shapes when broader facial expressions or tracking are needed.

Security:

- Validate message `source === "readyplayerme"`.
- Validate event origin against configured RPM subdomain.
- Do not expose RPM API key to browser.

### 7.2 VRM Import Flow

UX:

1. User clicks `Import VRM`.
2. User selects `.vrm`.
3. Client validates file size and extension.
4. Client attempts load with `@pixiv/three-vrm`.
5. App detects VRM version and capabilities.
6. App requests a presigned upload from the Liteforms `models/upload` endpoint with `model_type: "VRM"` and name.
7. App uploads the file to the returned `uploadUrl` with returned form fields.
8. App updates the Liteforms model record with upload URL/hash/file metadata and avatar calibration settings.
9. Character editor opens with renderer preview.

Implementation:

- Use `three`, `@react-three/fiber`, `@react-three/drei`, `@pixiv/three-vrm`, and `three-stdlib`.
- Use `VRMLoaderPlugin` with GLTFLoader.
- Support VRM 0.0 and 1.0 through `@pixiv/three-vrm` compatibility modules.
- Normalize coordinate scale and humanoid rest pose after loading.
- Store and apply calibration fields from AI-Avatar:
  - `scale`
  - `armSpacing`
  - `legSpacing`
  - `rootHeight`
  - per-animation `frequency` and `intensity`

## 8. Renderer and Animation

### 8.1 Renderer Requirements

- Render RPM GLB and VRM avatars in Three.js.
- RPM GLB support must use RPM's native rig and morph targets:
  - Oculus/OVR LipSync viseme morph targets for TTS lip sync.
  - ARKit-compatible blend shapes and additional RPM blend shapes where available for facial expressions.
  - eye bones and blink morph targets when included by the avatar configuration.
  - no RPM-to-VRM conversion step.
- VRM support must include:
  - MToon/material support.
  - VRM 0.0 and 1.0 metadata.
  - humanoid bones.
  - expressions/blendshapes.
  - spring bones.
  - look-at behavior.
  - animation retargeting.
  - lip sync from audio amplitude/visemes.

### 8.2 Renderer Modules

```text
lib/rendering/
  loaders/
    loadVrm.ts
    loadGlb.ts
  animation/
    retarget.ts
    idle.ts
    expressionController.ts
    lipSync.ts
    springBones.ts
  scene/
    AvatarScene.tsx
    cameraPresets.ts
```

### 8.3 Lip Sync

MVP lip sync:

- Use AI-Avatar's two-tier lipsync approach:
  - Kokoro timestamp path: schedule visemes from word timing data.
  - Fallback path: use Web Audio API RMS/amplitude analysis when word timing is unavailable.
- Drive RPM avatars through RPM's native Oculus/OVR LipSync viseme morph targets when available:
  - `viseme_sil`, `viseme_PP`, `viseme_FF`, `viseme_TH`, `viseme_DD`, `viseme_kk`, `viseme_CH`, `viseme_SS`, `viseme_nn`, `viseme_RR`, `viseme_aa`, `viseme_E`, `viseme_I`, `viseme_O`, `viseme_U`.
  - For coarse timing data, map AI-Avatar `VisemeGroup` concepts into the closest RPM viseme targets.
  - For RMS fallback, drive a small set of mouth-open/viseme weights rather than treating RPM as VRM.
- Drive VRM mouth expressions/visemes:
  - Use `aa`, `ih`, `ou`, `ee`, `oh` on VRM 1.0 where available.
  - Map AI-Avatar `VisemeGroup` concepts (`Silence`, `A`, `E`, `U`, `O`, `S`) to VRM expression presets.
- Kokoro web implementation should expose an equivalent of AI-Avatar's `/v1/audio/speech/timestamps` output: `{ word, start, end }` per word.
- For ElevenLabs, Deepgram TTS, and OpenAI-compatible TTS, use RMS fallback unless provider timing data is available.

Future:

- Add forced alignment or phoneme extraction for hosted TTS audio.

### 8.4 Animation Retargeting

- Import default idle animations as VRMA or GLTF animation clips.
- Use `@pixiv/three-vrm-animation` when available for VRM-native animation.
- Implement retarget maps for VRM humanoid rigs and RPM GLB humanoid rigs as separate paths. Do not normalize RPM by converting it to VRM.
- Maintain per-avatar calibration data in `animation_config`.
- Maintain AI-Avatar action hooks:
  - actions detected in user input.
  - actions detected in assistant response.
  - bracket/parenthesis action syntax such as `[wave]` or `(nod)`.
  - action trigger timing for user input recognized and response started.

## 9. LLM Provider System

### 9.1 Provider Interface

Use the AI-Avatar provider contracts as the baseline, translated to TypeScript. This keeps the web implementation compatible with Unity's `ILLMProvider`, `ITTSProvider`, and `ISTTProvider` behavior.

```ts
type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

type StreamToken = {
  type: "text" | "done" | "error";
  text?: string;
  error?: string;
};

type ChatRequest = {
  messages: ChatMessage[];
  model?: string;
  maxTokens: number;
  options?: Record<string, string>;
};

type LlmProviderConfig = {
  providerId: string;
  label: string;
  baseUrl?: string;
  model: string;
  credentialId?: string;
  headers?: Record<string, string>;
  compatibility:
    | "browser_transformers"
    | "openai_chat_completions"
    | "openai_responses"
    | "anthropic_messages"
    | "ollama"
    | "openclaw_websocket"
    | "codex_cli_oauth"
    | "claude_code_oauth";
};

interface BrowserLlmProvider {
  id: string;
  listModels(config: LlmProviderConfig): Promise<string[]>;
  testConnection(config: LlmProviderConfig): Promise<void>;
  streamChat(input: {
    config: LlmProviderConfig;
    request: ChatRequest;
    abortSignal?: AbortSignal;
  }): AsyncIterable<StreamToken>;
}
```

### 9.2 MVP Providers

`local-gemma`

- Default MVP brain.
- Runs fully in browser through Transformers.js / ONNX / WebGPU with WASM fallback where feasible.
- Initial target: Gemma 4 E2B INT4 quantized WebGPU model, pending upstream availability, license, browser memory, and quality validation.
- Download model weights directly to browser cache / IndexedDB on first use; do not route prompts or completions through Liteforms servers.
- Provide clear first-run download, cache size, and hardware fallback states.
- This default removes the need for `/api/liteforms/usage` request gating for LLM usage.

`openai`

- API key from browser credential store.
- Base URL default: `https://api.openai.com`.
- Match AI-Avatar `OpenAICompatibleLLM`: POST `{baseUrl}/v1/chat/completions` with SSE streaming.
- Must support custom OpenAI-compatible base URLs for Ollama, LM Studio, OpenRouter-compatible gateways, Groq-style APIs, and similar endpoints.
- Include first-class presets for OpenRouter and LM Studio even if they reuse the generic OpenAI-compatible adapter.

`ollama`

- Direct browser calls to local endpoint.
- Default base URL: `http://localhost:11434`.
- Support model listing through `/api/tags`.
- Support generation through native `/api/chat` or OpenAI-compatible `/v1/chat/completions` when configured.
- UX must include a setup helper:
  - endpoint field
  - test connection
  - model picker
  - CORS/private-network troubleshooting text

`openclaw`

- Direct browser HTTP calls to OpenClaw's OpenAI-compatible Gateway endpoint.
- Provider config:
  - Gateway OpenAI-compatible base URL, default `http://127.0.0.1:18789/v1`
  - token/password if required
  - agent target, default `openclaw/default`
- Use `POST /v1/chat/completions` with standard OpenAI-compatible streaming while keeping OpenClaw as a first-class Liteforms provider in the UI.
- Must be able to target OpenClaw's OpenAI, OpenAI-Codex, OpenRouter, Ollama, LM Studio, and Anthropic-backed models through the gateway when exposed by that gateway.
- When a character is configured to use OpenClaw, do not build or inject the default AI-Avatar persona system prompt. OpenClaw agents already carry personality and instructions.

`openai-codex`

- Required MVP provider path for users with ChatGPT subscriptions who do not use OpenClaw.
- Implement using the same effective approach OpenClaw uses for ChatGPT/Codex subscription access, and keep the configuration model similar to Claude Code OAuth.
- Match OpenClaw's provider id and label: `openai-codex` / `OpenAI Codex`.
- Use a same-origin `/api/llm/local-auth` route for browser OAuth/device pairing and keep the resulting token server-side.
- Do not show or require an OpenAI API key for this provider. Chat calls the ChatGPT Codex Responses backend with the OAuth token.
- Do not require OpenClaw Gateway for this path.

`anthropic`

- Include direct Anthropic API-key support in MVP because AI-Avatar already implements `AnthropicLLM`.
- Base URL default: `https://api.anthropic.com`.
- Use Messages API SSE streaming.
- Browser credential store holds the Anthropic API key.

`claude-cli`

- Required MVP provider path for users with Claude/Anthropic subscriptions where OpenClaw supports subscription-style access.
- Implement using the same effective approach OpenClaw uses for Anthropic subscription access, and keep the configuration model similar to AI-Avatar `ClaudeCodeLLM`.
- Match OpenClaw's Claude CLI backend naming: `claude-cli` / `Claude CLI`.
- Use local Claude CLI credential reuse. Liteforms runs the installed `claude` command server-side with stream-json output and does not require an API key or local HTTP helper.
- Do not show or require an Anthropic API key for this provider; direct Anthropic API-key access remains the separate `anthropic` provider.
- Do not require OpenClaw Gateway for this path.

### 9.3 Post-MVP Providers

- Generic OpenAI-compatible adapter presets.
- Server-side proxy for non-LLM provider calls only if a future privacy/security review approves it.

## 10. Conversation Pipeline

### 10.1 Text Chat Flow

1. User sends text.
2. App builds a provider-appropriate request:
   - For ordinary Liteforms characters, include the AI-Avatar persona pattern: character description, name, and pronouns.
   - For OpenClaw-configured characters, preserve the connected OpenClaw's existing personality and do not add Liteforms persona text.
3. App parses user-input action hooks.
4. App streams response from selected LLM provider.
5. Text appears incrementally in chat.
6. Response text is split into speakable sentence chunks as punctuation arrives.
7. Sentence chunks are sent to TTS while the LLM stream continues.
8. Audio plays as chunks are ready.
9. Avatar state changes through listening, thinking, speaking, and idle.
10. Avatar lip sync, expression, and response action hooks update during playback.

### 10.2 Voice Chat Flow

1. User grants microphone permission.
2. App records audio using Web Audio / MediaRecorder.
3. ASR worker transcribes audio locally.
4. Transcript populates the text input and auto-sends if enabled.
5. LLM/TTS/render pipeline proceeds as in text chat.

## 11. Speech

### 11.1 Local TTS: Kokoro

Implementation:

- Use `kokoro-js` from the local `kokoro/kokoro.js` reference or npm package.
- Load model `onnx-community/Kokoro-82M-v1.0-ONNX`.
- Preserve the AI-Avatar wire contract in the web abstraction:
  - PCM output is 24 kHz, 16-bit, mono.
  - voice defaults to `af_bella`.
  - timestamp data is word-level `{ word, start, end }`.
- Default device order:
  - `webgpu` when supported.
  - `wasm` fallback.
- Default dtype:
  - Apple Silicon/WebGPU: `fp32` or `q8` depending on measured performance.
  - WASM fallback: `q8`.
- Run inference in `kokoro.worker.ts`.
- Stream TTS by sentence/phrase using `TextSplitterStream`.
- Implement request de-duplication/caching equivalent to the Python sidecar's `(text, voice, speed)` cache.

Voice config:

```ts
type KokoroVoiceConfig = {
  provider: "kokoro";
  voice: string;
  dtype: "fp32" | "fp16" | "q8" | "q4" | "q4f16";
  device: "webgpu" | "wasm";
  speed?: number;
};
```

### 11.2 Local STT: Distil-Whisper ONNX/WebGPU

The local `faster-whisper/` package is Python/CTranslate2 and is not directly browser runnable. MVP browser STT uses Distil-Whisper through ONNX Runtime Web / Transformers.js:

- Default model target:
  - Distil-Whisper English model for conversational latency on 8GB machines.
  - optional larger or multilingual Distil-Whisper model for higher-end hardware.
- Device order:
  - WebGPU when available.
  - WASM fallback.
- Run in `asr.worker.ts`.
- Support English-first mode for MVP.
- Chunk long audio with VAD or fixed sliding windows.
- Expose an AI-Avatar-compatible provider shape:
  - `onInterim(transcript)`
  - `onFinal(transcript)`
  - `start()`
  - `stop()`

Future:

- Optional local sidecar fallback for browsers that cannot run Whisper locally, matching AI-Avatar's `/inference` endpoint.
- Investigate a true faster-whisper WebAssembly/WebGPU port if CTranslate2 or equivalent runtime becomes practical in browser.
- Revisit Parakeet or other ONNX/WebGPU ASR models post-MVP if they materially outperform Distil-Whisper in browser.

### 11.3 Hosted TTS: ElevenLabs and Deepgram

- Implement ElevenLabs as an optional provider.
- Browser credential store holds ElevenLabs API key.
- Match OpenClaw ElevenLabs config concepts:
  - `voiceId`
  - `modelId`
  - `stability`
  - `similarityBoost`
  - `style`
  - `useSpeakerBoost`
  - `speed`
- Default model: `eleven_multilingual_v2`.
- Implement Deepgram TTS as an optional provider.
- Browser credential store holds Deepgram API key.
- Support provider-specific model/voice selection and streaming when available.

### 11.4 Hosted STT: Deepgram and ElevenLabs

- Implement Deepgram as an optional provider.
- Browser credential store holds Deepgram API key.
- Default base URL: `https://api.deepgram.com/v1`.
- Default model: `nova-3`.
- POST audio to `/listen`.
- Implement ElevenLabs STT as an optional provider using Scribe/realtime transcription APIs.
- Browser credential store holds ElevenLabs API key.

## 12. RAG and Knowledge

### 12.1 MVP Scope

- RAG and per-character knowledge retrieval are not part of MVP.
- Do not build knowledge upload, embedding, fragment search, or RAG prompt injection for MVP.
- Keep existing AI-Avatar document and fragment API compatibility notes as post-MVP references only.

### 12.2 Post-MVP Implementation

Server-compatible RAG:

- `lib/liteforms-api/documents.ts`: create, update, delete, and read documents.
- `lib/liteforms-api/fragments.ts`: call `searchByPrompt`.
- Default embedding model: `text-embedding-3-small`.
- Use `matchCount` and `matchThreshold` settings equivalent to AI-Avatar remote config.
- Run two searches before each LLM turn, matching AI-Avatar:
  - search over accumulated chat history plus latest user message.
  - search over latest user message only.
- Concatenate both result sets and inject as character knowledge.

Local cache:

- Cache document body, fragment results, and query hashes in IndexedDB for latency.
- Do not make local embeddings the MVP source of truth while the existing Liteforms fragment API is available.

Prompt injection:

```text
Relevant knowledge for this character:

[source: <title>, chunk <n>]
<chunk content>
```

### 12.3 Future RAG Work

Future RAG work:

- Add browser-local embeddings for offline mode.
- Add per-character memory and conversation summaries.
- Add citations in assistant responses.
- Add file types beyond text through document parsers.

## 13. UX Requirements

### 13.1 Main Screens

- Preset character chat.
- Login.
- Character library.
- Create character wizard.
- Character editor.
- Chat/avatar stage.
- Provider settings.
- Voice/STT settings.

### 13.2 Create Character Wizard

Steps:

1. Avatar source:
   - Ready Player Me
   - Import VRM
2. Identity:
   - name
   - pronouns
   - personality
3. Model:
   - Local Gemma 4 E2B INT4 default
   - OpenAI
   - ChatGPT subscription
   - Anthropic API
   - Claude/Anthropic subscription
   - OpenRouter
   - Ollama
   - LM Studio
   - OpenClaw Gateway
4. Voice:
   - Kokoro default
   - ElevenLabs optional
5. Speech input:
   - local Distil-Whisper default
   - Deepgram optional
   - ElevenLabs optional
6. Test:
   - render avatar
   - test model connection
   - test TTS
   - test mic/STT

### 13.3 Chat Stage

Layout:

- Full-height Three.js avatar viewport.
- Compact side panel or bottom panel for chat.
- Text input always visible.
- Mic button.
- Provider/voice status indicators.
- Character selector.

States:

- loading avatar
- model loading for local TTS/STT
- provider disconnected
- streaming response
- speaking
- mic listening
- STT transcribing
- error with retry action

## 14. Browser and Hardware Targets

Priority:

- Apple Silicon macOS browsers with WebGPU.
- Nvidia GPU Windows/Linux Chrome/Edge with WebGPU.
- WASM fallback for lower-end devices.

Target feasibility:

- Aim to work on 8GB Apple Silicon Mac Mini using quantized models and careful worker memory management.
- Use lazy loading:
  - avatar renderer first
  - local Gemma model on first chat or settings test
  - Kokoro on first TTS use or settings test
  - ASR model on first mic/STT use
- Provide clear model-size controls.

Minimum browser:

- Chromium-based browser with WebGPU preferred.
- Safari support best effort due to WebGPU variability.
- Firefox support best effort; likely WASM fallback unless WebGPU is enabled.

## 15. Security and Privacy

- User provider credentials stay in browser by default.
- Backend storage is per-user and protected by row-level security.
- Avatar uploads and post-MVP knowledge uploads must be owner-scoped.
- Ready Player Me API keys must never be exposed in browser.
- Local endpoints must be clearly shown as direct browser calls.
- Do not proxy MVP LLM requests through Liteforms servers.
- Any future proxy proposal must include a privacy/security review, allowlist, and rate limits.
- Do not train or share character data with third-party providers except through the user's selected provider request.

## 16. Deployment

### 16.1 Vercel

- Next.js App Router deployment.
- Liteforms API env vars:
  - `LITEFORMS_API_BASE_URL`
  - `LITEFORMS_API_ACCESS_TOKEN`
  - `LITEFORMS_API_BASE_URL`
- Ready Player Me env vars:
  - `READY_PLAYER_ME_SUBDOMAIN`
  - `READY_PLAYER_ME_API_KEY` if server-side RPM API calls are needed.

### 16.2 Static Model Assets

Do not commit large ONNX weights directly unless license and repo size constraints are acceptable.

Preferred:

- Download from Hugging Face at runtime with browser cache.
- Allow self-hosted model asset base URL.
- Cache via browser Cache API / IndexedDB.

Optional:

- Provide a script to prefetch Gemma/Kokoro/ASR models into `public/models` for offline/dev builds.

## 17. Implementation Milestones

### Milestone 0: Project Scaffold

- Create Next.js TypeScript app in `Liteforms/`.
- Add lint/test/build setup.
- Add hosted login/session shell when a provider is selected.
- Add Liteforms API client shell.
- Add design tokens and base layout.
- Add unauthenticated preset character chat shell.

Acceptance:

- `npm run dev` starts.
- Login page renders.
- Auth session is readable client/server.
- Liteforms API account/usage call works for a signed-in user and is used only for account hydration/analytics.
- A preset character can be opened without login.

### Milestone 1: Character Storage

- Add Liteforms API character CRUD.
- Add character library and editor shell.
- Add IndexedDB credential store.

Acceptance:

- Signed-in user can create, edit, delete, and reopen a character.
- Unauthenticated users are prompted to sign in before creating or saving a custom character.
- Provider keys are saved only in browser.

### Milestone 2: Avatar Creation and Import

- Embed Ready Player Me Avatar Creator.
- Listen for `v1.avatar.exported`.
- Store/update RPM ID/token through Liteforms API.
- Create/update Liteforms model record for RPM avatar.
- Add VRM import.
- Add Liteforms presigned VRM upload flow.

Acceptance:

- User can create RPM avatar and see it in character/model library.
- User can import VRM 0.0 and VRM 1.0 and persist calibration settings.

### Milestone 3: Three.js / VRM Renderer

- Add avatar scene.
- Load GLB and VRM.
- Support VRM expressions and spring bones.
- Add idle animation and look-at.
- Add animation retargeting baseline.

Acceptance:

- Imported VRM animates in browser.
- Expressions can be triggered from UI.
- Spring bones update in render loop.

### Milestone 4: LLM Chat

- Add browser-local Gemma 4 E2B INT4 provider.
- Add provider adapters for OpenAI-compatible, Anthropic API-key, Anthropic/Claude subscription, Ollama, OpenRouter, LM Studio, OpenClaw, and ChatGPT subscription/Codex-compatible access.
- Add model settings UI.
- Add streaming text chat.
- Ensure no MVP LLM requests route through the Liteforms proxy server.

Acceptance:

- User can chat through the default browser-local Gemma model on supported hardware.
- User can chat via OpenAI API key.
- User can chat via ChatGPT subscription/Codex-compatible connector without OpenClaw when configured.
- User can chat via Anthropic API key.
- User can chat via Anthropic/Claude subscription connector without OpenClaw when configured.
- User can chat via OpenRouter.
- User can chat via local Ollama endpoint.
- User can chat via local LM Studio endpoint.
- User can chat via OpenClaw gateway endpoint.
- OpenClaw personalities are not overwritten by default Liteforms persona prompts.

### Milestone 5: Local TTS

- Add Kokoro worker.
- Add voice settings.
- Stream generated audio.
- Drive lip sync from Kokoro word timing data and RMS fallback.

Acceptance:

- Assistant response speaks locally through Kokoro.
- Avatar mouth moves during playback.

### Milestone 6: Local STT

- Add Distil-Whisper ONNX/WebGPU ASR worker.
- Add microphone capture.
- Add transcript UI and auto-send option.

Acceptance:

- User can speak into mic and get local transcription.
- Transcript can be sent to LLM.

### Milestone 7: Hosted Speech Options

- Add ElevenLabs TTS.
- Add Deepgram TTS.
- Add Deepgram STT.
- Add ElevenLabs STT.
- Add provider test buttons.

Acceptance:

- User can switch from Kokoro to ElevenLabs.
- User can switch from Kokoro to Deepgram TTS.
- User can switch from local ASR to Deepgram.
- User can switch from local ASR to ElevenLabs STT.

## 18. Testing Requirements

Unit tests:

- provider config validation
- stream parsers
- local Gemma provider request/stream handling
- credential store
- RPM event parsing
- RPM morph target detection and viseme mapping
- VRM metadata detection

Integration tests:

- character CRUD with auth
- avatar upload route
- OpenAI-compatible mock streaming
- Ollama mock endpoint
- OpenClaw gateway mock endpoint
- ChatGPT subscription/Codex connector mock

Browser tests:

- preset character chat without login
- create character wizard
- RPM avatar render and lip-sync smoke test
- VRM import and render smoke test
- chat send/stream/render
- local model loading fallback states

Manual hardware tests:

- Apple Silicon 8GB machine.
- Nvidia 8GB GPU machine.
- Chromium WebGPU.
- WASM fallback browser.

## 19. Open Issues

- Confirm exact production Liteforms API base URL, hosted auth audience, and browser app callback URLs.
- Confirm Ready Player Me commercial/free usage terms for the target deployment and user volume.
- Verify RPM iframe support for default avatar configuration, theme/styling controls, session restore, and export behavior. If styling is limited, document the MVP constraints.
- Confirm exact Gemma 4 E2B INT4 ONNX model source, license, browser cache behavior, and minimum viable hardware profile.
- Confirm the direct ChatGPT subscription/Codex connector path by matching OpenClaw's working implementation and Claude Code-style local OAuth configuration.
- Confirm the direct Anthropic/Claude subscription connector path by matching OpenClaw's working implementation and Claude Code-style local OAuth configuration.
- Choose exact Distil-Whisper ONNX model artifact and browser cache strategy.
- Verify the exact RPM Avatar API parameters needed to include Oculus/OVR LipSync visemes, ARKit blend shapes, blink targets, and eye bones in downloaded GLB avatars.
- Design CORS/private-network troubleshooting for direct local endpoints.
- Decide whether Liteforms Web should support the AI-Avatar local sidecar mode as an optional fallback for TTS/STT.

## 20. Key Engineering Risks

- Browser-local STT and TTS memory pressure on 8GB machines.
- Browser-local Gemma memory pressure, model download size, and first-run latency.
- WebGPU support variance across browsers.
- Direct browser calls to local endpoints may fail due to CORS or Private Network Access.
- VRM full-feature support requires careful handling of version differences.
- RPM GLB facial animation depends on requesting and detecting the correct RPM morph targets; missing morph targets would degrade lip sync/expression quality.
- ChatGPT subscription access is not equivalent to OpenAI API access.
- Large model downloads may make first-run UX slow.
- Hosted provider API capabilities change; verify ElevenLabs and Deepgram TTS/STT support at implementation time.

## 21. Recommended Package Baseline

Core:

- `next`
- `react`
- `typescript`
- `zod`
- `zustand`
- `idb`

Rendering:

- `three`
- `@react-three/fiber`
- `@react-three/drei`
- `@pixiv/three-vrm`

Speech/local ML:

- `kokoro-js`
- `@huggingface/transformers`
- `onnxruntime-web`

Backend:

- Hosted identity SDK or `next-auth` with OIDC.
- Existing Liteforms API client generated or handwritten from current API schema.

Testing:

- `vitest`
- `@testing-library/react`
- `playwright`

## 22. Acceptance Definition for MVP

MVP is complete when:

1. An unauthenticated user can chat with a preset character.
2. A signed-in user can create a character using Ready Player Me or import a VRM.
3. A signed-in user can save and reopen the character profile.
4. A signed-in user can configure name, pronouns, personality, voice, STT, and LLM provider.
5. A user can chat through text using the default local Gemma model, OpenAI, ChatGPT subscription connector, Anthropic API key, Anthropic/Claude subscription connector, OpenRouter, Ollama, LM Studio, or OpenClaw.
6. A user can speak through the mic and receive local browser transcription.
7. A user can hear local browser Kokoro speech output.
8. A user can see RPM and VRM avatars rendered in Three.js with working expressions, animation, and lip sync; imported VRM avatars also support spring bones.
9. Provider credentials remain local to the browser.
10. MVP LLM requests never route through the Liteforms proxy.
