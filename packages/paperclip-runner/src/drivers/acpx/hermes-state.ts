import { randomUUID } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, readdir, rename, rm } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import type { NativeRuntimeContextSnapshot } from "../../contracts/runtime-context.js";

/** Only these native files belong to an agent. Sessions, auth and configuration
 * belong to the isolated conversation home and never cross this boundary. */
const DIRECTORIES = ["memories", "skills"] as const;
const TEMPORARY_NAME = /^\.paperclip-hermes-transfer-[a-f0-9-]{36}\.tmp$/;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;

export async function stageHermesAgentState(home: string, context: NativeRuntimeContextSnapshot | null) {
  const workingCopy = context?.instructions.workingCopy;
  if (workingCopy?.kind !== "agent_files") throw new Error("Hermes requires managed agent-file storage for native memory and learned skills");
  const agentRoot = resolve(workingCopy.rootPath);
  await assertDirectory(agentRoot);
  const stateRoot = join(agentRoot, "hermes");
  await ensureDirectory(stateRoot);
  for (const name of DIRECTORIES) await mirrorDirectory(join(stateRoot, name), join(home, name));
  return {
    async collect() {
      // Called after verified process exit and before the controller collects
      // the existing working copy. Its usual authorization and save receipt apply.
      await assertDirectory(agentRoot);
      for (const name of DIRECTORIES) await mirrorDirectory(join(home, name), join(stateRoot, name));
    },
  };
}

async function assertDirectory(path: string) {
  const stat = await lstat(path);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error("Hermes state contains an unsafe directory");
}
async function ensureDirectory(path: string) {
  await mkdir(path, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
  await assertDirectory(path);
}
async function inventory(root: string): Promise<Map<string, number>> {
  const files = new Map<string, number>();
  let total = 0;
  let entries = 0;
  const walk = async (directory: string) => {
    await assertDirectory(directory);
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      if (++entries > 100_000) throw new Error("Hermes learned state exceeds the managed file count limit");
      const path = join(directory, entry.name);
      const stat = await lstat(path);
      if (stat.isDirectory() && !stat.isSymbolicLink()) await walk(path);
      else {
        if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || stat.size > MAX_FILE_BYTES) throw new Error("Hermes learned state must contain bounded regular files");
        // Reserved transfer files may survive a crash. Validate before
        // removing them so symlinks/hardlinks still fail closed.
        if (TEMPORARY_NAME.test(entry.name) || entry.name.endsWith(".paperclip-state.tmp")) {
          await rm(path); continue;
        }
        total += stat.size;
        if (total > MAX_TOTAL_BYTES) throw new Error("Hermes learned state exceeds managed storage limits");
        files.set(relative(root, path), stat.size);
      }
    }
  };
  await walk(root);
  return files;
}
async function mirrorDirectory(source: string, destination: string) {
  await ensureDirectory(source);
  await ensureDirectory(destination);
  const files = await inventory(source);
  const previous = await inventory(destination);
  for (const [name, size] of files) {
    const target = join(destination, name);
    const parts = relative(destination, dirname(target)).split(/[\\/]/).filter(Boolean);
    let directory = destination;
    for (const part of parts) { directory = join(directory, part); await ensureDirectory(directory); }
    const input = await open(join(source, name), constants.O_RDONLY | constants.O_NOFOLLOW);
    const temporary = join(dirname(target), `.paperclip-hermes-transfer-${randomUUID()}.tmp`);
    try {
      const before = await input.stat({ bigint: true });
      if (!before.isFile() || before.nlink !== 1n || before.size !== BigInt(size)) throw new Error("Hermes state changed during collection");
      const output = await open(temporary, "wx", 0o600);
      try {
        const buffer = Buffer.alloc(Math.min(size + 1, 64 * 1024));
        let offset = 0;
        while (offset < size) {
          const read = await input.read(buffer, 0, Math.min(buffer.length, size - offset), offset);
          if (!read.bytesRead) throw new Error("Hermes state changed during collection");
          await output.writeFile(buffer.subarray(0, read.bytesRead));
          offset += read.bytesRead;
        }
        await output.sync();
      } finally { await output.close(); }
      const after = await input.stat({ bigint: true });
      if (before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs || before.size !== after.size) throw new Error("Hermes state changed during collection");
      await rename(temporary, target);
    } finally { await input.close(); await rm(temporary, { force: true }); }
  }
  for (const name of previous.keys()) if (!files.has(name)) await rm(join(destination, name));
}
