# schoolbridge

**Connect Canvas (and other school platforms) to AI agents.**

schoolbridge watches your school's LMS and turns it into something an AI agent can actually use. When a teacher posts an assignment, uploads a grade, changes a due date, or makes an announcement, your agent finds out — and can brief you, rank your week, or build a study plan for the next test.

It speaks three dialects, so it works with almost any agent setup:

| Interface | For | Example |
|---|---|---|
| **MCP server** | Claude Code, Claude Desktop, Claude Cowork, any MCP client | `schoolbridge mcp` |
| **Agent skill** (`SKILL.md`) | Hermes, OpenClaw, any Agent-Skills runtime | `schoolbridge install-skill hermes` |
| **JSON CLI** | Shell-driven agents, cron jobs, scripts | `schoolbridge upcoming --json` |
| **Event watcher** | Push-style automations | `schoolbridge watch --exec 'my-agent brief'` |

Canvas is the built-in provider. The provider interface is small and documented, so Google Classroom, Schoology, Moodle, and others can be added — see [docs/PROVIDERS.md](docs/PROVIDERS.md).

schoolbridge is **read-only**: it never writes anything back to your LMS.

---

## Quick start

```bash
npm install -g schoolbridge     # or run everything below with: npx schoolbridge …
```

### Try it instantly (no credentials)

Every command accepts `--provider mock`, which serves realistic sample data:

```bash
schoolbridge upcoming --provider mock
```

```
 1. [CRITICAL 73] Chapter 12 Reading Quiz
    US History · overdue by 20h · 10 pts · missing
 2. [HIGH 66] Unit 4 Test: Cellular Energetics
    AP Biology · due in 4d 23h · 100 pts · unsubmitted
 3. [HIGH 59] Reconstruction DBQ Essay
    US History · due in 2d 23h · 100 pts · unsubmitted
 ...
```

### Connect your real Canvas account

1. Log in to Canvas in a browser → **Account → Settings** → scroll to **Approved Integrations** → **+ New Access Token**. Copy the token immediately.
2. Run:

```bash
schoolbridge init --base-url https://yourschool.instructure.com --token <paste-token>
```

`init` verifies the connection, then saves the config to `~/.schoolbridge/config.json` (created with `0600` permissions — it holds your token). You can also skip the file entirely and use the `CANVAS_BASE_URL` and `CANVAS_ACCESS_TOKEN` environment variables.

Then:

```bash
schoolbridge upcoming          # ranked work due this week (+ recent overdue work)
schoolbridge grades            # course grades + recently graded assignments
schoolbridge announcements     # recent teacher announcements
schoolbridge events            # what changed since the last check
```

---

## Use with Claude (MCP)

### Claude Code

```bash
claude mcp add schoolbridge -- npx -y schoolbridge mcp
```

### Claude Desktop / Claude Cowork

Add to your MCP configuration (e.g. `claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "schoolbridge": {
      "command": "npx",
      "args": ["-y", "schoolbridge", "mcp"],
      "env": {
        "CANVAS_BASE_URL": "https://yourschool.instructure.com",
        "CANVAS_ACCESS_TOKEN": "your-token"
      }
    }
  }
}
```

(If you ran `schoolbridge init`, the `env` block is optional — the server reads the saved config.)

Then just ask:

> *"What's new at school?"* · *"Rank everything I have due this week and plan my days."* · *"Make me a study plan for the biology test."*

### MCP tools

| Tool | Returns |
|---|---|
| `list_courses` | Active courses with current grade/score |
| `list_upcoming_work` | Work due in the next N days (default 7) + recent overdue work, each with a 0–100 `priority` ranking hint |
| `get_assignment_details` | One assignment with its full instructions as plain text |
| `list_announcements` | Teacher announcements from the last N days |
| `get_grades` | Course grades + everything graded in the last two weeks |
| `check_new_events` | Everything that changed since the last check (see [Events](#events)) |

### MCP prompts

| Prompt | Does |
|---|---|
| `whats_new` | Check for changes and brief the student |
| `plan_my_week` | Rank the week's work and lay out a day-by-day plan |
| `study_plan` | Build a day-by-day study plan for a test (args: `course`, optional `assignment`) |

---

## Use with Hermes

schoolbridge ships a portable [Agent Skills](https://agentskills.io) `SKILL.md` that teaches Hermes the whole workflow — setup, ranking, study plans, and event monitoring. Install it either way:

```bash
npm install -g schoolbridge
schoolbridge install-skill hermes      # writes ~/.hermes/skills/schoolbridge/SKILL.md
```

or straight from this repo with Hermes' own installer:

```bash
hermes skills install https://raw.githubusercontent.com/Shoberman2/schoolbridge/main/skill/SKILL.md
```

Hermes auto-discovers the skill on startup and activates it whenever the conversation is school-shaped ("what homework do I have?", "plan my week", "make a study plan for the bio test"). Add `schoolbridge events --json` to a heartbeat/schedule and Hermes will proactively tell you when a teacher posts an assignment, uploads a grade, or makes an announcement.

## Use with OpenClaw

Same skill, OpenClaw flavor — the frontmatter carries an `metadata.openclaw` block that gates on the `schoolbridge` binary and points OpenClaw's installer at the npm package:

```bash
npm install -g schoolbridge
schoolbridge install-skill openclaw    # writes ~/.openclaw/skills/schoolbridge/SKILL.md
```

Per-workspace instead: copy [`skill/`](skill/) into `<workspace>/skills/schoolbridge/`. For proactive alerts, add a line to your `HEARTBEAT.md` such as: *"Run `schoolbridge events --json`; if it prints events, tell me about them."*

There's also `schoolbridge install-skill agents` for the shared `~/.agents/skills` directory used by other Agent-Skills-compatible runtimes.

## Use with any other agent (shell/JSON)

Every read command takes `--json` and prints clean, stable JSON — pipe it straight into your agent's context:

```bash
schoolbridge upcoming --json --days 7
schoolbridge grades --json
schoolbridge announcements --json --days 3
schoolbridge assignment 101 5002 --json     # full details incl. instructions
```

### Polling for changes

`schoolbridge events` diffs the LMS against the previous run and prints only what changed. The first run saves a baseline and prints nothing. State lives in `~/.schoolbridge/state.<provider>.json`.

```bash
schoolbridge events --json      # one JSON event per line; empty output = nothing new
schoolbridge events --reset     # start over from a fresh baseline
```

A cron heartbeat for a shell-based agent:

```cron
*/15 8-22 * * * schoolbridge events --json | your-agent ingest-school-events
```

### Push mode

`watch` polls on an interval, prints events to stdout as JSON lines (logs go to stderr), and can push each batch onward:

```bash
schoolbridge watch --interval 15m --exec 'your-agent brief --stdin'   # JSON payload on stdin
schoolbridge watch --interval 15m --webhook https://your-agent.example/hooks/school
```

The webhook/exec payload:

```json
{
  "source": "schoolbridge",
  "provider": "canvas",
  "generatedAt": "2026-08-17T20:15:00.000Z",
  "events": [ … ]
}
```

---

## Events

Every event has the same shape, so agents can pattern-match on `type`:

```json
{
  "type": "grade_posted",
  "occurredAt": "2026-08-17T20:15:00.000Z",
  "courseId": "101",
  "courseName": "AP Biology",
  "title": "Cell Respiration Lab Report",
  "summary": "Grade posted in AP Biology: “Cell Respiration Lab Report” — 47/50 (94%).",
  "url": "https://yourschool.instructure.com/courses/101/assignments/5001",
  "data": { "assignmentId": "5001", "score": 47, "grade": "47", "pointsPossible": 50 }
}
```

| `type` | Fires when |
|---|---|
| `new_assignment` | A teacher posts an assignment, quiz, or test |
| `due_date_changed` | An assignment is rescheduled |
| `grade_posted` | A grade appears on previously ungraded work |
| `grade_changed` | An existing grade is revised |
| `new_announcement` | A teacher posts an announcement |
| `course_grade_changed` | Your overall course grade moves |

`summary` is always a ready-to-speak sentence; `data` carries the structured before/after values.

---

## Priority ranking

`list_upcoming_work` / `schoolbridge upcoming` attach a `priority` score (0–100) and label (`critical` / `high` / `medium` / `low`) to each item. It weighs:

- **due-date proximity** (heaviest factor),
- **point value**,
- **test-likeness** (quizzes, or names matching *test/exam/midterm/final*),
- **missing/overdue status** (boost) and **already submitted** (drops to ~0).

It's deliberately a *hint*, not a verdict — the intended pattern is for the AI to use it as a starting order and override it with judgment (start the essay before the worksheet, even if the worksheet is due first).

## Use as a library

```ts
import { CanvasProvider, listUpcoming, checkEvents, StateStore } from "schoolbridge";

const provider = new CanvasProvider({ baseUrl: "https://yourschool.instructure.com", token: process.env.CANVAS_ACCESS_TOKEN! });
const ranked = await listUpcoming(provider, 7);
const { events } = await checkEvents(provider, new StateStore(provider.name));
```

## Configuration reference

Resolution order for every setting: **CLI flag → environment variable → `~/.schoolbridge/config.json`**.

| Setting | Flag | Env var |
|---|---|---|
| Provider (`canvas` / `mock`) | `--provider` | `SCHOOLBRIDGE_PROVIDER` |
| Canvas URL | `--base-url` | `CANVAS_BASE_URL` |
| Canvas token | `--token` | `CANVAS_ACCESS_TOKEN` (or `CANVAS_TOKEN`) |
| Config/state directory | — | `SCHOOLBRIDGE_HOME` (default `~/.schoolbridge`) |

## Privacy & safety

- Your token and all state stay **on your machine**; schoolbridge talks only to your school's Canvas host (and, if you opt in, your own webhook).
- All operations are **read-only** against the LMS.
- Treat your Canvas token like a password. You can revoke it any time from Canvas → Account → Settings.

## Roadmap

- Providers: Google Classroom, Schoology, Moodle, PowerSchool
- Calendar export (ICS) of upcoming work
- Canvas modules/files context for richer study plans
- Native push (Canvas live events) where institutions allow it

## Contributing

PRs welcome — especially new providers. See [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/PROVIDERS.md](docs/PROVIDERS.md). The `mock` provider and `npm test` let you develop without any school credentials.

## License

[MIT](LICENSE)
