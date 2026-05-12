# Liteforms Web

Liteforms Web is a browser-first avatar chat app built with Next.js, React, TypeScript, and Three.js. It renders a VRM avatar, lets users chat with the character, and supports local or external LLM, speech-to-text, and text-to-speech providers.

The default path is designed to work without a hosted account system: users can run the app locally, use browser-local models, or enter their own provider credentials in the app.

## Features

- Realtime 3D avatar scene with VRM loading, animation, expression, mouth movement, and Looking Glass/WebXR support.
- Character editor for name, pronouns, personality, and custom VRM upload.
- Browser-local LLM options using ONNX/Transformers models.
- Browser-local Kokoro TTS and Distil-Whisper STT.
- External LLM providers including OpenAI-compatible APIs, Anthropic, Google AI Studio, Google Live, xAI, Mistral, Cerebras, NVIDIA, OpenRouter, Groq, Together, Fireworks, Qwen Cloud, Ollama, LM Studio, OpenClaw Gateway, OpenAI Codex, and Claude CLI.
- External speech providers including OpenAI, Google, ElevenLabs, Deepgram, xAI, Mistral, DeepInfra, OpenRouter, Inworld, MiniMax, Gradium, Vydra, Xiaomi MiMo, Azure Speech, Microsoft Edge TTS, and Volcengine.
- Browser storage for session, character, credential, and uploaded VRM settings.

## Requirements

- Node.js 20 or newer is recommended.
- npm.
- A modern Chromium-based browser is recommended for local model and audio features.

Local browser models can be large. The first run may download model assets and can take a while depending on network speed and hardware.

## Getting Started

Install dependencies:

```bash
npm install
```

Start the development server:

```bash
npm run dev
```

Open the local URL printed by Next.js, usually:

```text
http://localhost:3000
```

If port `3000` is already in use, Next.js will choose another port.

## Scripts

```bash
npm run dev       # Start the Next.js development server
npm run build     # Create a production build
npm run lint      # Run ESLint
npm run test      # Run the Vitest suite
npm run test:smoke:providers # Ping cloud providers with API keys from .env
npm run test:watch
```

## Configuration

Most provider configuration happens inside the app UI. Users can choose the built-in local path or configure their own LLM, TTS, and STT providers.

Provider smoke tests read `.env`, `.env.local`, `.env.test`, and `.env.test.local` from the project root. They skip any provider without a matching API key. Shared key names such as `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_API_KEY`, `GEMINI_API_KEY`, `ELEVENLABS_API_KEY`, `DEEPGRAM_API_KEY`, `MISTRAL_API_KEY`, and provider-specific names are supported. Use `LITEFORMS_LLM_<PROVIDER>_API_KEY`, `LITEFORMS_TTS_<PROVIDER>_API_KEY`, or `LITEFORMS_STT_<PROVIDER>_API_KEY` when one account needs different keys per capability.

## Credentials And Privacy

Provider API keys and tokens entered in the app are stored in browser-local storage, not committed to the repository. The `.gitignore` excludes local environment files such as `.env`, `.env.local`, and `.env*.local`.

Do not commit real provider credentials or private model assets. If you add a new provider, keep credentials user-supplied and local unless there is a deliberate server-side integration.

## Project Structure

```text
app/          Next.js app routes and API routes
components/   React UI and avatar/chat/onboarding components
lib/          Provider adapters, storage, avatar, speech, and API helpers
public/       Bundled VRM/GLB/VRMA assets
types/        Shared type declarations
workers/      Browser workers for local model execution
docs/         Technical notes and planning material
```

## Development Notes

- Use red/green test-driven development for behavior changes.
- Prefer focused tests near the code being changed.
- Browser-local models, microphone access, and audio playback are browser-sensitive; verify in a real browser when touching those flows.
- If a Next.js dev server behaves strangely after deleting middleware or generated files, stop all running `next dev` processes and restart from a clean `.next` cache.

## Open-Source Notes

While Liteforms is open source, packages used by the project may or may not be. For example, the Looking Glass WebXR library is proprietary.

## License

See [LICENSE](./LICENSE).
