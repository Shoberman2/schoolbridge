#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { Command } from "commander";
import { configFile, createProvider, resolveConfig, saveConfigFile, type CliOverrides } from "./config.js";
import { checkEvents } from "./events.js";
import {
  renderAnnouncements,
  renderAssignment,
  renderCourses,
  renderEvents,
  renderGrades,
  renderUpcoming,
} from "./format.js";
import { runMcpServer } from "./mcp.js";
import { SKILL_TARGETS, skillInstallPath, skillMarkdown, type SkillTarget } from "./skill.js";
import { decorateAssignment, getGrades, listUpcoming } from "./queries.js";
import { StateStore } from "./state.js";
import { VERSION } from "./version.js";

const program = new Command();
program
  .name("schoolbridge")
  .description(
    "Connect Canvas (and other school platforms) to AI agents: JSON CLI, event watcher, and MCP server."
  )
  .version(VERSION);

interface CommonOpts extends CliOverrides {
  json?: boolean;
}

function withCommon(cmd: Command): Command {
  return cmd
    .option("--provider <name>", "provider to use: canvas | mock")
    .option("--base-url <url>", "Canvas base URL, e.g. https://yourschool.instructure.com")
    .option("--token <token>", "Canvas access token");
}

function ctx(opts: CliOverrides) {
  const cfg = resolveConfig(opts);
  return { cfg, provider: createProvider(cfg), store: new StateStore(cfg.provider) };
}

function run<T extends unknown[]>(fn: (...args: T) => Promise<void>) {
  return (...args: T) =>
    fn(...args).catch((err: unknown) => {
      console.error(`Error: ${err instanceof Error ? err.message : String(err)}`);
      process.exit(1);
    });
}

function parseDuration(s: string): number {
  const m = /^(\d+)\s*(s|m|h|d)?$/i.exec(s.trim());
  if (!m) throw new Error(`Invalid interval "${s}" — use forms like 30s, 10m, 1h`);
  const unit = (m[2] ?? "m").toLowerCase();
  const mult = unit === "s" ? 1_000 : unit === "m" ? 60_000 : unit === "h" ? 3_600_000 : 86_400_000;
  return Math.max(Number(m[1]) * mult, 30_000);
}

withCommon(
  program
    .command("init")
    .description("Save provider credentials to the schoolbridge config file and verify the connection")
).action(
  run(async (opts: CliOverrides) => {
    const providerName = opts.provider ?? "canvas";
    if (providerName === "mock") {
      saveConfigFile({ provider: "mock" });
      console.log(`Saved ${configFile()} — using the mock provider (sample data, no credentials needed).`);
      return;
    }
    if (providerName !== "canvas") {
      throw new Error(`Unknown provider "${providerName}". Available providers: canvas, mock`);
    }
    const baseUrl = opts.baseUrl ?? process.env.CANVAS_BASE_URL;
    const token = opts.token ?? process.env.CANVAS_ACCESS_TOKEN ?? process.env.CANVAS_TOKEN;
    if (!baseUrl || !token) {
      console.error(
        [
          "Canvas setup needs two values:",
          "  --base-url   your school's Canvas URL, e.g. https://yourschool.instructure.com",
          "  --token      a Canvas access token",
          "",
          "To create a token: log in to Canvas in a browser → Account → Settings →",
          'scroll to "Approved Integrations" → "+ New Access Token". Copy it right away.',
          "",
          "Then run:",
          "  schoolbridge init --base-url https://yourschool.instructure.com --token <paste-token>",
        ].join("\n")
      );
      process.exit(1);
    }
    const provider = createProvider({ provider: "canvas", canvas: { baseUrl, token } });
    const courses = await provider.listCourses();
    saveConfigFile({ provider: "canvas", canvas: { baseUrl, token } });
    console.log(
      `Connected to ${baseUrl} — found ${courses.length} active course${courses.length === 1 ? "" : "s"}.`
    );
    console.log(`Saved ${configFile()}`);
  })
);

withCommon(program.command("courses").description("List active courses with current grades"))
  .option("--json", "output JSON")
  .action(
    run(async (opts: CommonOpts) => {
      const { provider } = ctx(opts);
      const courses = await provider.listCourses();
      console.log(opts.json ? JSON.stringify(courses, null, 2) : renderCourses(courses));
    })
  );

withCommon(
  program
    .command("upcoming")
    .description("Assignments, quizzes, and tests due soon, ranked by priority (includes recent overdue work)")
)
  .option("--days <n>", "lookahead window in days", "7")
  .option("--json", "output JSON")
  .action(
    run(async (opts: CommonOpts & { days: string }) => {
      const { provider } = ctx(opts);
      const items = await listUpcoming(provider, Number(opts.days) || 7);
      console.log(opts.json ? JSON.stringify(items, null, 2) : renderUpcoming(items));
    })
  );

withCommon(program.command("announcements").description("Recent teacher announcements across all courses"))
  .option("--days <n>", "how many days back to look", "14")
  .option("--json", "output JSON")
  .action(
    run(async (opts: CommonOpts & { days: string }) => {
      const { provider } = ctx(opts);
      const items = await provider.listAnnouncements(await provider.listCourses(), Number(opts.days) || 14);
      console.log(opts.json ? JSON.stringify(items, null, 2) : renderAnnouncements(items));
    })
  );

withCommon(program.command("grades").description("Current course grades plus recently graded work"))
  .option("--json", "output JSON")
  .action(
    run(async (opts: CommonOpts) => {
      const { provider } = ctx(opts);
      const report = await getGrades(provider);
      console.log(opts.json ? JSON.stringify(report, null, 2) : renderGrades(report));
    })
  );

withCommon(
  program
    .command("assignment <courseId> <assignmentId>")
    .description("Full details for one assignment, including its instructions")
)
  .option("--json", "output JSON")
  .action(
    run(async (courseId: string, assignmentId: string, opts: CommonOpts) => {
      const { provider } = ctx(opts);
      const a = await provider.getAssignment(courseId, assignmentId);
      if (!a) throw new Error(`Assignment ${assignmentId} not found in course ${courseId}`);
      const ranked = decorateAssignment(a);
      console.log(opts.json ? JSON.stringify(ranked, null, 2) : renderAssignment(ranked));
    })
  );

withCommon(
  program
    .command("events")
    .description(
      "One-shot check: diff against the last run and print what changed (new assignments, grades, announcements…)"
    )
)
  .option("--json", "output events as JSON lines (one event per line)")
  .option("--reset", "clear saved state and re-baseline")
  .action(
    run(async (opts: CommonOpts & { reset?: boolean }) => {
      const { provider, store } = ctx(opts);
      if (opts.reset) store.clear();
      const { baseline, events } = await checkEvents(provider, store);
      if (baseline) {
        console.error("[schoolbridge] First run: baseline saved. Future runs report what changed.");
        return;
      }
      if (opts.json) {
        for (const e of events) console.log(JSON.stringify(e));
      } else {
        console.log(renderEvents(events));
      }
    })
  );

withCommon(
  program
    .command("watch")
    .description("Poll on an interval and emit change events as JSON lines on stdout (logs go to stderr)")
)
  .option("--interval <duration>", "poll interval, e.g. 30s, 10m, 1h", "15m")
  .option("--webhook <url>", "POST each batch of events as JSON to this URL")
  .option("--exec <command>", "run this shell command for each batch; the JSON payload arrives on stdin")
  .action(
    run(async (opts: CliOverrides & { interval: string; webhook?: string; exec?: string }) => {
      const { provider, store } = ctx(opts);
      const ms = parseDuration(opts.interval);
      console.error(
        `[schoolbridge] watching (provider: ${provider.name}) every ${opts.interval} — events print to stdout as JSON lines`
      );
      const tick = async (): Promise<void> => {
        try {
          const { baseline, events } = await checkEvents(provider, store);
          const stamp = new Date().toLocaleTimeString();
          if (baseline) {
            console.error(`[schoolbridge] baseline saved (${stamp})`);
          } else if (events.length === 0) {
            console.error(`[schoolbridge] no changes (${stamp})`);
          } else {
            for (const e of events) console.log(JSON.stringify(e));
            const payload = JSON.stringify({
              source: "schoolbridge",
              provider: provider.name,
              generatedAt: new Date().toISOString(),
              events,
            });
            if (opts.webhook) {
              try {
                await fetch(opts.webhook, {
                  method: "POST",
                  headers: { "content-type": "application/json" },
                  body: payload,
                });
              } catch (err) {
                console.error(`[schoolbridge] webhook failed: ${err instanceof Error ? err.message : err}`);
              }
            }
            if (opts.exec) {
              const child = spawn(opts.exec, { shell: true, stdio: ["pipe", "inherit", "inherit"] });
              child.stdin.write(payload);
              child.stdin.end();
            }
          }
        } catch (err) {
          console.error(`[schoolbridge] poll failed: ${err instanceof Error ? err.message : err}`);
        }
        setTimeout(tick, ms);
      };
      await tick();
    })
  );

program
  .command("install-skill [target]")
  .description(
    "Install the schoolbridge agent skill (SKILL.md) for Hermes, OpenClaw, or any Agent-Skills runtime"
  )
  .option("--dir <path>", "install into a custom skills directory instead of a known target")
  .option("--print", "print the SKILL.md to stdout instead of installing")
  .action(
    run(async (target: string | undefined, opts: { dir?: string; print?: boolean }) => {
      if (opts.print) {
        process.stdout.write(skillMarkdown());
        return;
      }
      if (target && !opts.dir && !(target in SKILL_TARGETS)) {
        throw new Error(
          `Unknown target "${target}". Use one of: ${Object.keys(SKILL_TARGETS).join(", ")} — or --dir <path>`
        );
      }
      const file = skillInstallPath(target as SkillTarget | undefined, opts.dir);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, skillMarkdown());
      console.log(`Installed schoolbridge skill → ${file}`);
      const note = target && target in SKILL_TARGETS ? SKILL_TARGETS[target as SkillTarget].note : null;
      if (note) console.log(note);
      console.log(
        "The skill drives the schoolbridge CLI — make sure it's on PATH (npm i -g schoolbridge) and configured (schoolbridge init …)."
      );
    })
  );

withCommon(
  program
    .command("mcp")
    .description("Run the schoolbridge MCP server on stdio (for Claude Code, Claude Desktop, Cowork, etc.)")
).action(
  run(async (opts: CliOverrides) => {
    const { provider, store } = ctx(opts);
    console.error(`[schoolbridge] MCP server v${VERSION} (provider: ${provider.name}) on stdio`);
    await runMcpServer(provider, store);
  })
);

program.parseAsync(process.argv);
