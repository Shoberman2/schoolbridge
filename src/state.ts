import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { Snapshot } from "./types.js";

/** Where schoolbridge keeps config and state. Override with SCHOOLBRIDGE_HOME. */
export function dataDir(): string {
  return process.env.SCHOOLBRIDGE_HOME ?? join(homedir(), ".schoolbridge");
}

/**
 * Persists the last-seen snapshot so successive runs can diff for events.
 * State is kept per provider so mock demos never pollute real Canvas state.
 */
export class StateStore {
  private readonly file: string;

  constructor(providerName: string, file?: string) {
    this.file = file ?? join(dataDir(), `state.${providerName}.json`);
  }

  load(): Snapshot | null {
    try {
      const parsed = JSON.parse(readFileSync(this.file, "utf8"));
      return parsed?.snapshot ?? null;
    } catch {
      return null;
    }
  }

  save(snapshot: Snapshot): void {
    mkdirSync(dirname(this.file), { recursive: true });
    writeFileSync(this.file, JSON.stringify({ version: 1, snapshot }, null, 2));
  }

  clear(): void {
    try {
      rmSync(this.file);
    } catch {
      /* already gone */
    }
  }
}
