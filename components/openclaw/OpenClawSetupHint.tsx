"use client";

import { useState } from "react";
import { OPENCLAW_ENABLE_CHAT_COMPLETIONS_COMMAND } from "@/lib/llm/openclawSetup";

export function OpenClawSetupHint() {
  const [copied, setCopied] = useState(false);

  async function copyCommand() {
    await navigator.clipboard?.writeText(OPENCLAW_ENABLE_CHAT_COMPLETIONS_COMMAND);
    setCopied(true);
  }

  return (
    <div className="openclaw-setup">
      <div className="openclaw-setup-header">OpenClaw setup</div>
      <p>Run in OpenClaw terminal, then restart the Gateway.</p>
      <div className="openclaw-command-row">
        <code>{OPENCLAW_ENABLE_CHAT_COMPLETIONS_COMMAND}</code>
        <button
          type="button"
          className="btn-ghost"
          aria-label="Copy OpenClaw setup command"
          onClick={copyCommand}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

