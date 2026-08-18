import { homedir } from "node:os";
import { join } from "node:path";
import { VERSION } from "./version.js";

/**
 * The portable SKILL.md that teaches agent frameworks (Hermes, OpenClaw, and
 * anything else that speaks the Agent Skills standard) how to use the
 * schoolbridge CLI. One document serves every framework: Hermes reads
 * name/description/version/author, OpenClaw additionally honors the
 * metadata.openclaw requirements/install block, and unknown fields are ignored.
 *
 * The repo's skill/SKILL.md is generated from this — regenerate with:
 *   node dist/cli.js install-skill --print > skill/SKILL.md
 */
export function skillMarkdown(): string {
  return `---
name: schoolbridge
description: Check school assignments, grades, due dates, and teacher announcements from Canvas (or another LMS) via the schoolbridge CLI. Use when the user asks about homework, upcoming tests, deadlines, grades, study plans, or anything school-related — and on heartbeats/schedules to catch new school activity and report it.
version: ${VERSION}
author: schoolbridge contributors
homepage: https://github.com/Shoberman2/schoolbridge
metadata: {"openclaw":{"emoji":"🎒","requires":{"bins":["schoolbridge"]},"install":[{"id":"npm","kind":"node","package":"schoolbridge","bins":["schoolbridge"]}]}}
---

# schoolbridge — assignments, grades & announcements

schoolbridge is a **read-only** CLI bridge to the student's school LMS (Canvas
first; provider-pluggable). It never submits, messages, or changes anything at
school — it only reads.

## Setup (once)

Run \`schoolbridge courses\`. If it errors with "Canvas is not configured":

1. Ask the user for their school's Canvas URL and an access token
   (created in Canvas → Account → Settings → Approved Integrations →
   "+ New Access Token").
2. Run: \`schoolbridge init --base-url <url> --token <token>\`

If the school instead issued an OAuth Developer Key (third-party app access),
authorize in the browser with:
\`schoolbridge auth login --base-url <url> --client-id <id> --client-secret <secret>\`
— tokens then refresh automatically.

If the student can't create a token (some schools disable it; the mobile app
has no token button), fall back to the zero-credential calendar feed: have
them open Canvas in a web browser → Calendar → "Calendar Feed" (bottom-right)
→ copy the .ics URL, then run:
\`schoolbridge init --provider ics --feed-url <url>\`
This covers assignments, due dates, calendar events, ranking, and study
plans — but not grades, announcements, or feedback, so skip those features
and say why if asked.

The token/secret values are secrets — never repeat them back in conversation
or logs. For testing without credentials, add \`--provider mock\` to any
command to get realistic sample data.

## Commands (add --json for machine-readable output)

- \`schoolbridge upcoming --json [--days N]\` — work due in the next N days
  (default 7) across all courses, plus recent overdue unsubmitted work. Each
  item carries \`priority\` (0–100) and \`priorityLabel\`
  (critical/high/medium/low), \`status\` (unsubmitted/submitted/graded/missing/
  overdue), \`dueInHours\`, points, and URLs.
- \`schoolbridge grades --json\` — current grade per course plus everything
  graded in the last two weeks with scores.
- \`schoolbridge announcements --json [--days N]\` — teacher announcements,
  newest first (default: last 14 days).
- \`schoolbridge assignment <courseId> <assignmentId> --json\` — one
  assignment with its full instructions as plain text. Use this before
  building a study plan.
- \`schoolbridge calendar --json [--days N]\` — upcoming course calendar
  events (review sessions, field trips, in-class tests; default: next 30 days).
- \`schoolbridge feedback --json [--days N]\` — teacher comments on the
  student's submitted work (default: last 14 days).
- \`schoolbridge events --json\` — **everything** that changed since the last
  check: new assignments, due-date changes, posted/changed grades, new
  announcements, new discussions, new or rescheduled calendar events, newly
  published course content and files, new teacher feedback, and course-grade
  moves. One JSON object per line; **empty output means nothing new**. The
  first run ever saves a baseline and prints nothing.

## Proactive monitoring (heartbeats)

On a heartbeat or schedule, run \`schoolbridge events --json\`. If it prints
events, tell the user about them — every event has a ready-to-speak
\`summary\` field and a \`data\` object with the structured before/after
values. Lead with what matters: grades on big assignments, new tests, and
due-date changes. Each change is emitted exactly once, so anything you see is
news — no need to dedupe or track state yourself.

## Ranking work ("what should I do first?")

Run \`schoolbridge upcoming --json\`. Use \`priority\` as the starting order,
then override with judgment: multi-day essays and test prep must **start**
well before their due date, while short worksheets can wait; anything with
\`status: "missing"\` needs a decision (do it late or let it go) today.
Present a ranked list with a one-line reason per item, then a realistic
day-by-day plan. Skip items already \`submitted\`.

## Study plans

1. Find the test/assignment in \`schoolbridge upcoming --json\` (match
   loosely by name if the user gave one).
2. Read its topics: \`schoolbridge assignment <courseId> <assignmentId> --json\`.
3. Build a day-by-day plan from today to the due date: topics per session
   structured around the description, active recall (self-quizzing, practice
   problems, explaining from memory) rather than rereading, 25–45 minute
   sessions, and a light final review the day before. Account for other work
   due in the same stretch so the plan stays realistic.
`;
}

export type SkillTarget = "hermes" | "openclaw" | "agents";

export const SKILL_TARGETS: Record<SkillTarget, { dir: () => string; note: string }> = {
  hermes: {
    dir: () => join(homedir(), ".hermes", "skills"),
    note: "Hermes auto-discovers skills on startup — restart the agent (or run its skills reload) to activate.",
  },
  openclaw: {
    dir: () => join(homedir(), ".openclaw", "skills"),
    note: "OpenClaw loads this on the next session. Requires the `schoolbridge` binary on PATH (npm i -g schoolbridge).",
  },
  agents: {
    dir: () => join(homedir(), ".agents", "skills"),
    note: "Installed to the shared ~/.agents/skills directory used by Agent-Skills-compatible runtimes.",
  },
};

/** Full path of the SKILL.md for a target (or a custom skills directory). */
export function skillInstallPath(target: SkillTarget | undefined, customDir?: string): string {
  const dir = customDir ?? (target ? SKILL_TARGETS[target].dir() : undefined);
  if (!dir) throw new Error("install-skill needs a target (hermes | openclaw | agents) or --dir <path>");
  return join(dir, "schoolbridge", "SKILL.md");
}
