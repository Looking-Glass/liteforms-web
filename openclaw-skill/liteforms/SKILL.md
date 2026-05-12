---
name: liteforms-web
description: Set up, configure, and launch the Liteforms Web avatar chat app with OpenClaw Gateway as its LLM brain.
metadata:
  {
    "openclaw":
      {
        "requires": { "bins": ["git", "node", "npm", "openclaw"] },
      },
  }
---

# Liteforms Web

Set up Liteforms Web locally and connect it to the user's local OpenClaw Gateway.

## What Liteforms Needs

- Repository: `https://github.com/Looking-Glass/liteforms-web.git`
- App directory: `liteforms-web`
- Development command: `npm run dev`
- Local app URL: usually `http://localhost:3000`
- OpenClaw Gateway OpenAI-compatible base URL: `http://127.0.0.1:18789/v1`
- Liteforms LLM provider id: `openclaw`
- Recommended Liteforms model value: `openclaw/default`
- Browser session config key: `liteforms.sessionConfig`

Liteforms already includes OpenClaw Gateway as an LLM provider. Do not patch Liteforms source unless the installed repo no longer exposes the OpenClaw provider.

## Workflow

1. Verify prerequisites:

   ```bash
   git --version
   node --version
   npm --version
   openclaw --version
   ```

   Require Node.js 20 or newer for Liteforms Web.

2. Clone or update the repo:

   ```bash
   git clone https://github.com/Looking-Glass/liteforms-web.git
   cd liteforms-web
   ```

   If `liteforms-web` already exists, enter it and run:

   ```bash
   git pull --ff-only
   ```

3. Install Liteforms dependencies.

   If `package-lock.json` is present, use a clean, deterministic install:

   ```bash
   npm ci
   ```

   Use `npm install` only when you intentionally need to update the lockfile.

4. Configure OpenClaw Gateway for Liteforms:

   ```bash
   openclaw config set gateway.http.endpoints.chatCompletions.enabled true --strict-json
   ```

   Start or restart the Gateway after changing this setting:

   ```bash
   openclaw gateway
   ```

   If the Gateway refuses to start on a fresh install, run the user's normal OpenClaw setup/onboarding flow first, or use `openclaw gateway --allow-unconfigured` only for ad-hoc local bootstrap.

5. Enable fast mode for the OpenClaw session Liteforms will use.

   Prefer a session-level setting by sending this through an OpenClaw chat/TUI/web session that uses the same agent/model Liteforms should talk to:

   ```text
   /fast on
   ```

   If the user wants the default OpenAI/OpenAI-Codex model to always use fast mode, configure the model default instead. Preserve existing `agents.defaults.models` entries when editing config. Example shape:

   ```json
   {
     "agents": {
       "defaults": {
         "models": {
           "openai/gpt-5.5": {
             "params": {
               "fastMode": true
             }
           }
         }
       }
     }
   }
   ```

6. Get the Gateway token only when Liteforms needs it.

   Liteforms shows an "OpenClaw Gateway token" field during onboarding. The value is `gateway.auth.token` or `OPENCLAW_GATEWAY_TOKEN`.

   ```bash
   openclaw config get gateway.auth.token
   ```

   Treat this value as a local secret: do not paste it into public logs, issue trackers, or summaries. If automating a browser, write it directly into Liteforms local storage or the form field without echoing it back to the user.

7. Start Liteforms:

   ```bash
   npm run dev
   ```

   Read the URL printed by Next.js. It is usually `http://localhost:3000`, but Next.js may choose another port if `3000` is busy.

8. Open the app in a browser tab.

   If the browser starts on the onboarding screen, choose:

   - Model provider: `OpenClaw Gateway`
   - Model: `openclaw/default`
   - Base URL: `http://127.0.0.1:18789/v1`
   - OpenClaw Gateway token: the local Gateway token, if token auth is enabled
   - Voice provider: `Kokoro local`, unless the user wants another TTS provider
   - Speech input provider: `Distil-Whisper`, unless the user wants another STT provider

## Browser Automation Shortcut

When browser automation is available and the user wants the setup prefilled, set Liteforms local storage before interacting with the app. Replace `GATEWAY_TOKEN` with the token only in the browser execution context; do not print it.

```js
localStorage.setItem(
  "liteforms.sessionConfig",
  JSON.stringify({
    version: 1,
    llm: {
      provider: "openclaw",
      model: "openclaw/default",
      baseUrl: "http://127.0.0.1:18789/v1",
      endpointMode: "openai-compatible",
      credential: "GATEWAY_TOKEN"
    },
    tts: { provider: "kokoro" },
    asr: { provider: "distil-whisper" }
  })
);
```

If Gateway auth is disabled, omit the `credential` field.

## Verification

If a build failure appears, first reproduce it from a clean tree:

```bash
git clean -xfd && npm ci && npm run build
```

If the failure still reproduces there, treat it as a real repo issue and patch or pin from that exact error.

After launch:

1. Confirm the Gateway is reachable:

   ```bash
   openclaw gateway health
   ```

2. In Liteforms, confirm Settings shows:

   - Model provider: `OpenClaw Gateway`
   - Model: `openclaw/default`

3. Send a short chat message. If Liteforms reports a 404 for `/v1/chat/completions`, rerun the chat-completions config command and restart the Gateway. If it reports 401, re-enter the Gateway token.

## Safety Notes

- Do not commit `.env`, `.env.local`, browser storage dumps, or Gateway tokens.
- Do not expose the Gateway beyond loopback unless the user deliberately configured Gateway auth and bind settings.
- Keep Liteforms provider credentials browser-local unless the user explicitly asks for server-side deployment work.
