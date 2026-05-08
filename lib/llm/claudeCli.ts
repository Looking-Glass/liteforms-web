import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { buildChatMessages } from "./persona";
import type { ChatRequest } from "./types";

type SpawnClaudeCli = (args: string[], input: string) => ChildProcessWithoutNullStreams;

const CLAUDE_CLI_TIMEOUT_MS = 120_000;
const CLAUDE_CLI_ARGS = [
  "-p",
  "--output-format",
  "stream-json",
  "--include-partial-messages",
  "--verbose",
  "--setting-sources",
  "user"
];

const CLAUDE_CLI_MODEL_ALIASES: Record<string, string> = {
  "claude-opus-4-7": "opus",
  "claude-opus-4-6": "opus",
  "claude-opus-4-5": "opus",
  "claude-sonnet-4-6": "sonnet",
  "claude-sonnet-4-5": "sonnet",
  "claude-haiku-4-5": "haiku"
};

export async function* streamClaudeCliText(
  request: ChatRequest,
  spawnClaudeCli: SpawnClaudeCli = spawnClaudeCliProcess
): AsyncIterable<string> {
  const args = buildClaudeCliArgs(request.config.model);
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnClaudeCli(args, buildClaudeCliPrompt(request));
  } catch (error) {
    throw new Error(formatClaudeCliLaunchError(error));
  }
  let stderr = "";
  let stdout = "";
  let settled = false;
  const parser = createClaudeCliJsonlStreamingParser();
  const pendingDeltas: string[] = [];

  const exit = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (settled) return;
      child.kill();
      reject(new Error(`Claude CLI exceeded timeout (${Math.round(CLAUDE_CLI_TIMEOUT_MS / 1000)}s).`));
    }, CLAUDE_CLI_TIMEOUT_MS);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });

  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    stdout += chunk;
    pendingDeltas.push(...parser.push(chunk));
  });
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });

  try {
    while (true) {
      while (pendingDeltas.length > 0) {
        yield pendingDeltas.shift()!;
      }
      const result = await Promise.race([exit, delay(20)]);
      if (result !== undefined) {
        break;
      }
    }
    const result = await exit;
    settled = true;
    for (const delta of parser.finish()) {
      yield delta;
    }
    while (pendingDeltas.length > 0) {
      yield pendingDeltas.shift()!;
    }
    if (result.code !== 0 || result.signal) {
      throw new Error(formatClaudeCliFailure(stderr, stdout, result));
    }
    const fallback = parser.resultText();
    if (fallback && !parser.hasStreamedText()) {
      yield fallback;
    }
  } finally {
    settled = true;
  }
}

export function buildClaudeCliArgs(model: string) {
  const normalizedModel = CLAUDE_CLI_MODEL_ALIASES[model] ?? model;
  return [...CLAUDE_CLI_ARGS, "--model", normalizedModel];
}

export function buildClaudeCliPrompt(request: ChatRequest) {
  const messages = buildChatMessages({
    provider: request.config.provider,
    persona: request.persona,
    messages: request.messages
  });
  return messages
    .map((message) => {
      if (message.role === "system") return `System:\n${message.content}`;
      if (message.role === "assistant") return `Assistant:\n${message.content}`;
      return `User:\n${message.content}`;
    })
    .join("\n\n");
}

export function createClaudeCliJsonlStreamingParser() {
  let buffer = "";
  let streamedText = "";
  let finalText = "";

  const parseLine = (line: string) => {
    const parsed = safeJsonRecord(line);
    if (!parsed) return [];
    const deltas = extractClaudeCliDeltas(parsed);
    if (deltas.length > 0) {
      streamedText += deltas.join("");
      return deltas;
    }
    const resultText = extractClaudeCliResultText(parsed);
    if (resultText) {
      finalText = resultText;
    }
    return [];
  };

  const flush = (flushPartial: boolean) => {
    const deltas: string[] = [];
    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex < 0) break;
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) deltas.push(...parseLine(line));
    }
    if (flushPartial) {
      const line = buffer.trim();
      buffer = "";
      if (line) deltas.push(...parseLine(line));
    }
    return deltas;
  };

  return {
    push(chunk: string) {
      buffer += chunk;
      return flush(false);
    },
    finish() {
      return flush(true);
    },
    hasStreamedText() {
      return streamedText.length > 0;
    },
    resultText() {
      return finalText;
    }
  };
}

export async function resolveClaudeCliStatus(spawnClaudeCli: SpawnClaudeCli = spawnClaudeCliProcess) {
  let child: ChildProcessWithoutNullStreams;
  try {
    child = spawnClaudeCli(["--version"], "");
  } catch (error) {
    return {
      provider: "claude-cli" as const,
      authenticated: false,
      source: "Claude CLI",
      message: formatClaudeCliLaunchError(error)
    };
  }
  let stderr = "";
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk: string) => {
    stderr += chunk;
  });
  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolve({ code, signal }));
  });
  return {
    provider: "claude-cli" as const,
    authenticated: result.code === 0 && !result.signal,
    source: "Claude CLI",
    message:
      result.code === 0 && !result.signal
        ? "Claude CLI is available. Authentication is managed by your local Claude CLI login."
        : `Claude CLI is not available${stderr.trim() ? `: ${stderr.trim()}` : "."}`
  };
}

function spawnClaudeCliProcess(args: string[], input: string) {
  const command = process.platform === "win32" ? "claude.exe" : "claude";
  const child = spawn(command, args, {
    stdio: ["pipe", "pipe", "pipe"],
    env: clearClaudeManagedEnv(process.env)
  });
  if (input) {
    child.stdin.end(input);
  } else {
    child.stdin.end();
  }
  return child;
}

function formatClaudeCliLaunchError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code === "ENOENT") {
    return "Claude CLI was not found on PATH. Install Claude Code or add claude.exe to PATH, then run claude auth login.";
  }
  if (code === "EINVAL") {
    return "Claude CLI could not be launched. On Windows, make sure claude.exe is on PATH, then restart the Liteforms dev server.";
  }
  if (code === "EPERM") {
    return "Claude CLI launch was blocked by the OS or sandbox. Run the Liteforms dev server from a normal terminal with access to claude.exe.";
  }
  return error instanceof Error ? `Claude CLI could not be launched: ${error.message}` : "Claude CLI could not be launched.";
}

function extractClaudeCliDeltas(parsed: Record<string, unknown>) {
  if (parsed.type !== "stream_event" || !isRecord(parsed.event)) return [];
  const event = parsed.event;
  if (event.type !== "content_block_delta" || !isRecord(event.delta)) return [];
  const delta = event.delta;
  return delta.type === "text_delta" && typeof delta.text === "string" && delta.text ? [delta.text] : [];
}

function extractClaudeCliResultText(parsed: Record<string, unknown>) {
  if (parsed.type !== "result" || typeof parsed.result !== "string") return "";
  const nested = safeJsonRecord(parsed.result);
  if (nested?.type === "result" && typeof nested.result === "string") return nested.result.trim();
  return parsed.result.trim();
}

function formatClaudeCliFailure(
  stderr: string,
  stdout: string,
  result: { code: number | null; signal: NodeJS.Signals | null }
) {
  const detail = extractErrorText(stderr) || extractErrorText(stdout) || stderr.trim() || stdout.trim();
  const suffix = result.signal ? `signal ${result.signal}` : `exit code ${result.code ?? "unknown"}`;
  return detail ? `Claude CLI failed (${suffix}): ${detail}` : `Claude CLI failed (${suffix}).`;
}

function extractErrorText(raw: string) {
  for (const line of raw.split(/\r?\n/)) {
    const parsed = safeJsonRecord(line.trim());
    if (!parsed) continue;
    if (typeof parsed.error === "string") return parsed.error;
    if (typeof parsed.message === "string") return parsed.message;
    if (isRecord(parsed.error) && typeof parsed.error.message === "string") return parsed.error.message;
  }
  return "";
}

function clearClaudeManagedEnv(env: NodeJS.ProcessEnv) {
  const next = { ...env };
  for (const key of [
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "ANTHROPIC_OAUTH_TOKEN",
    "CLAUDE_CODE_OAUTH_REFRESH_TOKEN",
    "CLAUDE_CODE_OAUTH_TOKEN",
    "CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST"
  ]) {
    delete next[key];
  }
  return next;
}

function delay(ms: number) {
  return new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), ms));
}

function safeJsonRecord(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}
