"use client";

import { useEffect, useState } from "react";
import { createIndexedDbCredentialRepository } from "@/lib/storage/indexedDbCredentialRepository";
import { CREDENTIAL_PROVIDER_IDS, LLM_PROVIDER_OPTIONS } from "@/lib/llm/providerOptions";
import { TTS_PROVIDER_OPTIONS, STT_PROVIDER_OPTIONS } from "@/lib/speech/providerOptions";
import type { BrowserCredential } from "@/lib/storage/types";

/** LLM + speech providers that require an API credential, de-duplicated and sorted. */
const CREDENTIAL_PROVIDER_OPTIONS = (() => {
  const seen = new Set<string>();
  const combined: { id: string; label: string }[] = [];

  for (const p of LLM_PROVIDER_OPTIONS) {
    if (CREDENTIAL_PROVIDER_IDS.includes(p.id) && !seen.has(p.id)) {
      seen.add(p.id);
      combined.push({ id: p.id, label: p.label });
    }
  }
  for (const p of TTS_PROVIDER_OPTIONS) {
    if (p.needsCredential && !seen.has(p.id)) {
      seen.add(p.id);
      combined.push({ id: p.id, label: p.label });
    }
  }
  for (const p of STT_PROVIDER_OPTIONS) {
    if (p.needsCredential && !seen.has(p.id)) {
      seen.add(p.id);
      combined.push({ id: p.id, label: p.label });
    }
  }
  return combined;
})();

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
            {CREDENTIAL_PROVIDER_OPTIONS.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
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
