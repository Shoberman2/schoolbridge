import { homedir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { skillInstallPath, skillMarkdown } from "../src/skill.js";
import { VERSION } from "../src/version.js";

describe("skillMarkdown", () => {
  const md = skillMarkdown();

  it("has valid Agent Skills frontmatter", () => {
    expect(md.startsWith("---\n")).toBe(true);
    const frontmatter = md.split("---")[1];
    // Required by both Hermes and OpenClaw:
    expect(frontmatter).toContain("name: schoolbridge");
    expect(frontmatter).toContain("description: ");
    // Hermes conventions:
    expect(frontmatter).toContain(`version: ${VERSION}`);
    expect(frontmatter).toContain("author: ");
    // OpenClaw gating: require the CLI binary, with an npm install hint.
    expect(frontmatter).toContain('"requires":{"bins":["schoolbridge"]}');
    expect(frontmatter).toContain('"package":"schoolbridge"');
  });

  it("teaches the core CLI surface", () => {
    for (const cmd of ["upcoming --json", "grades --json", "announcements --json", "events --json", "schoolbridge init"]) {
      expect(md).toContain(cmd);
    }
    expect(md).toContain("empty output");
  });
});

describe("skillInstallPath", () => {
  it("maps targets to their skills directories", () => {
    expect(skillInstallPath("hermes")).toBe(join(homedir(), ".hermes", "skills", "schoolbridge", "SKILL.md"));
    expect(skillInstallPath("openclaw")).toBe(join(homedir(), ".openclaw", "skills", "schoolbridge", "SKILL.md"));
    expect(skillInstallPath("agents")).toBe(join(homedir(), ".agents", "skills", "schoolbridge", "SKILL.md"));
  });

  it("prefers a custom directory and rejects no-target-no-dir", () => {
    expect(skillInstallPath(undefined, "/tmp/skills")).toBe(join("/tmp/skills", "schoolbridge", "SKILL.md"));
    expect(() => skillInstallPath(undefined)).toThrow(/target/);
  });
});
