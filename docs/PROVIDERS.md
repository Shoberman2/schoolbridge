# Adding a provider

schoolbridge treats every school platform as a `SchoolProvider` — four
read-only methods defined in [`src/providers/provider.ts`](../src/providers/provider.ts):

```ts
export interface SchoolProvider {
  readonly name: string;
  listCourses(): Promise<Course[]>;
  listAssignments(course: Course): Promise<Assignment[]>;
  getAssignment(courseId: string, assignmentId: string): Promise<Assignment | null>;
  listAnnouncements(courses: Course[], sinceDays: number): Promise<Announcement[]>;
}
```

Everything else — event detection, priority ranking, the CLI, the MCP server,
the watcher — is provider-agnostic and works automatically once these four
methods return correctly shaped data ([`src/types.ts`](../src/types.ts)).

## Steps

1. Create `src/providers/<name>.ts` exporting a class that implements
   `SchoolProvider`. Use [`canvas.ts`](../src/providers/canvas.ts) as the
   reference for a real HTTP integration and [`mock.ts`](../src/providers/mock.ts)
   for the minimal shape.
2. Register it in `src/config.ts`: extend `ProviderName`, `resolveConfig`
   (credential resolution: CLI flag → env var → config file), and
   `createProvider`.
3. Mention its credentials in the README configuration table.
4. Add a test that builds a snapshot from your provider (see
   `test/mock.test.ts`).

## Mapping guidance

| schoolbridge field | Notes |
|---|---|
| `Course.currentScore` / `currentGrade` | Overall course grade as % and letter; `null` if the platform hides it |
| `Assignment.dueAt` | ISO 8601 or `null`; the differ compares these strings exactly, so return stable values |
| `Assignment.isQuiz` | `true` when the platform marks it a quiz/test — feeds the priority boost |
| `Assignment.description` | Plain text (use `htmlToText` from `src/html.ts`), only from `getAssignment` |
| `Assignment.submission` | The student's own submission state; drives `grade_posted` / `grade_changed` events |
| `Announcement.message` | Plain text, full body |
| ids | Always strings, stable across polls — they key the event differ |

## Rules

- **Read-only.** Never mutate LMS state.
- **Stable output.** The event engine diffs successive snapshots; jittery
  timestamps or ids produce phantom events (this is why the mock provider
  anchors its clock to midnight).
- **Fail loudly.** Throw descriptive errors that include the HTTP status; the
  CLI and watcher surface them to the user.
