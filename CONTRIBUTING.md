# Contributing to schoolbridge

Thanks for helping students' agents get smarter. PRs of every size are welcome.

## Dev setup

```bash
git clone <your-fork>
cd schoolbridge
npm install
npm run build      # compile to dist/
npm test           # vitest unit tests
npm run dev -- upcoming --provider mock    # run the CLI from source
```

You never need real school credentials to develop: `--provider mock` serves
realistic sample data through the exact same code paths, and the test suite
runs entirely offline.

## What we'd love help with

- **New providers** (Google Classroom, Schoology, Moodle, PowerSchool…) — the
  interface is four read-only methods. Full guide: [docs/PROVIDERS.md](docs/PROVIDERS.md).
- More event types (calendar events, module publishes, submission comments).
- Better ranking heuristics in `src/priority.ts` (keep it explainable).
- Real-world Canvas quirks — institutions configure Canvas very differently;
  bug reports with the failing (redacted) API response are gold.

## Ground rules

- **Read-only.** schoolbridge never writes to an LMS. PRs that submit work,
  message teachers, or modify LMS state will not be merged.
- **No telemetry.** Tokens and data stay on the user's machine.
- Keep dependencies minimal (currently: commander, zod, the MCP SDK).
- `npm run build && npm test` must pass; add tests for behavior changes.

## The agent skill

`skill/SKILL.md` (used by Hermes/OpenClaw installs) is **generated** from
`src/skill.ts` — edit the source, then regenerate the committed copy:

```bash
npm run build && node dist/cli.js install-skill --print > skill/SKILL.md
```

## Releasing

Maintainers: bump `version` in both `package.json` and `src/version.ts`, then
`npm publish` (the `prepublishOnly` hook builds and tests).
