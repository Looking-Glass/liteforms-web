"use client";

import { useEffect, useState } from "react";
import { createIndexedDbCredentialRepository } from "@/lib/storage/indexedDbCredentialRepository";
import type { BrowserCredential } from "@/lib/storage/types";

export function CredentialSettingsPanel() {
  const [credentials, setCredentials] = useState<BrowserCredential[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    const repo = await createIndexedDbCredentialRepository();
    setCredentials(await repo.list());
  }

  async function onSubmit(formData: FormData) {
    const repo = await createIndexedDbCredentialRepository();

    await repo.save({
      providerId: String(formData.get("providerId") ?? ""),
      label: String(formData.get("label") ?? ""),
      kind: "api_key",
      encryptedValue: String(formData.get("credential") ?? "")
    });

    setStatus("Saved in this browser.");
    await refresh();
  }

  return (
    <section className="editor-section">
      <p className="eyebrow">Browser storage</p>
      <h1>Provider credentials</h1>
      <form action={onSubmit} className="stacked-form">
        <label>
          Provider
          <select name="providerId" defaultValue="openai">
            <option value="openai">OpenAI</option>
            <option value="anthropic">Anthropic</option>
            <option value="openrouter">OpenRouter</option>
            <option value="elevenlabs">ElevenLabs</option>
            <option value="deepgram">Deepgram</option>
          </select>
        </label>
        <label>
          Label
          <input name="label" placeholder="Personal key" required />
        </label>
        <label>
          API key or token
          <input name="credential" type="password" required />
        </label>
        <button type="submit">Save locally</button>
        <p role="status">{status}</p>
      </form>
      <ul className="credential-list">
        {credentials.map((credential) => (
          <li key={credential.id}>
            <strong>{credential.label}</strong>
            <span>{credential.providerId}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
