import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const nextDir = join(root, ".next");
const standaloneDir = join(nextDir, "standalone");

if (!existsSync(standaloneDir)) {
  throw new Error("Missing .next/standalone. Run the Electron Next build before preparing assets.");
}

copyDirectory(join(nextDir, "static"), join(standaloneDir, ".next", "static"));

const publicDir = join(root, "public");
if (existsSync(publicDir)) {
  copyDirectory(publicDir, join(standaloneDir, "public"));
}

console.log("[electron] Prepared standalone Next assets.");

function copyDirectory(from, to) {
  if (!existsSync(from)) {
    throw new Error(`Missing required Electron build asset directory: ${from}`);
  }
  rmSync(to, { recursive: true, force: true });
  mkdirSync(to, { recursive: true });
  cpSync(from, to, { recursive: true });
}
