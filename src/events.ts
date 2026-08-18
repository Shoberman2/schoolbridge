import { fmtDateTime, gradeStr } from "./format.js";
import type { SchoolProvider } from "./providers/provider.js";
import type { StateStore } from "./state.js";
import type { Assignment, SchoolEvent, Snapshot } from "./types.js";

/** Fetches the full current view of the LMS and flattens it into a diffable snapshot. */
export async function buildSnapshot(
  provider: SchoolProvider
): Promise<{ snapshot: Snapshot; assignments: Assignment[] }> {
  const courses = await provider.listCourses();
  const snapshot: Snapshot = {
    takenAt: new Date().toISOString(),
    courses: {},
    assignments: {},
    announcements: {},
  };
  const all: Assignment[] = [];

  const perCourse = await Promise.all(
    courses.map(async (c) => ({ course: c, assignments: await provider.listAssignments(c) }))
  );
  for (const { course, assignments } of perCourse) {
    snapshot.courses[course.id] = {
      name: course.name,
      currentScore: course.currentScore,
      currentGrade: course.currentGrade,
    };
    for (const a of assignments) {
      all.push(a);
      snapshot.assignments[`${course.id}:${a.id}`] = {
        courseId: course.id,
        courseName: course.name,
        name: a.name,
        dueAt: a.dueAt,
        pointsPossible: a.pointsPossible,
        url: a.url,
        score: a.submission?.score ?? null,
        grade: a.submission?.grade ?? null,
        gradedAt: a.submission?.gradedAt ?? null,
      };
    }
  }

  for (const an of await provider.listAnnouncements(courses, 30)) {
    snapshot.announcements[an.id] = {
      courseId: an.courseId,
      courseName: an.courseName,
      title: an.title,
      postedAt: an.postedAt,
      url: an.url,
    };
  }
  return { snapshot, assignments: all };
}

function scoreStr(score: number | null, grade: string | null, points: number | null): string {
  if (score != null && points) return `${score}/${points} (${Math.round((score / points) * 1000) / 10}%)`;
  if (score != null) return String(score);
  if (grade) return grade;
  return "graded";
}

/** Compares two snapshots and returns everything that changed, as agent-friendly events. */
export function diffSnapshots(prev: Snapshot, next: Snapshot): SchoolEvent[] {
  const now = new Date().toISOString();
  const events: SchoolEvent[] = [];

  for (const [key, a] of Object.entries(next.assignments)) {
    const assignmentId = key.split(":")[1];
    const before = prev.assignments[key];
    if (!before) {
      events.push({
        type: "new_assignment",
        occurredAt: now,
        courseId: a.courseId,
        courseName: a.courseName,
        title: a.name,
        url: a.url,
        summary: `New assignment in ${a.courseName}: “${a.name}”${
          a.dueAt ? `, due ${fmtDateTime(a.dueAt)}` : ""
        }${a.pointsPossible != null ? ` (${a.pointsPossible} pts)` : ""}.`,
        data: { assignmentId, dueAt: a.dueAt, pointsPossible: a.pointsPossible },
      });
      continue;
    }

    if (before.dueAt !== a.dueAt) {
      events.push({
        type: "due_date_changed",
        occurredAt: now,
        courseId: a.courseId,
        courseName: a.courseName,
        title: a.name,
        url: a.url,
        summary: `“${a.name}” in ${a.courseName} was rescheduled: ${fmtDateTime(before.dueAt)} → ${fmtDateTime(
          a.dueAt
        )}.`,
        data: { assignmentId, previousDueAt: before.dueAt, dueAt: a.dueAt },
      });
    }

    const hadGrade = before.gradedAt != null || before.score != null;
    const hasGrade = a.gradedAt != null || a.score != null;
    if (!hadGrade && hasGrade) {
      events.push({
        type: "grade_posted",
        occurredAt: now,
        courseId: a.courseId,
        courseName: a.courseName,
        title: a.name,
        url: a.url,
        summary: `Grade posted in ${a.courseName}: “${a.name}” — ${scoreStr(
          a.score,
          a.grade,
          a.pointsPossible
        )}.`,
        data: { assignmentId, score: a.score, grade: a.grade, pointsPossible: a.pointsPossible, gradedAt: a.gradedAt },
      });
    } else if (hadGrade && hasGrade && (before.score !== a.score || before.grade !== a.grade)) {
      events.push({
        type: "grade_changed",
        occurredAt: now,
        courseId: a.courseId,
        courseName: a.courseName,
        title: a.name,
        url: a.url,
        summary: `Grade updated in ${a.courseName}: “${a.name}” — ${scoreStr(
          before.score,
          before.grade,
          a.pointsPossible
        )} → ${scoreStr(a.score, a.grade, a.pointsPossible)}.`,
        data: {
          assignmentId,
          previousScore: before.score,
          previousGrade: before.grade,
          score: a.score,
          grade: a.grade,
          pointsPossible: a.pointsPossible,
        },
      });
    }
  }

  for (const [id, an] of Object.entries(next.announcements)) {
    if (prev.announcements[id]) continue;
    events.push({
      type: "new_announcement",
      occurredAt: now,
      courseId: an.courseId,
      courseName: an.courseName,
      title: an.title,
      url: an.url,
      summary: `New announcement in ${an.courseName}: “${an.title}”.`,
      data: { announcementId: id, postedAt: an.postedAt },
    });
  }

  for (const [id, c] of Object.entries(next.courses)) {
    const before = prev.courses[id];
    if (!before) continue;
    const changed = before.currentScore !== c.currentScore || before.currentGrade !== c.currentGrade;
    const meaningful = before.currentScore != null || c.currentScore != null || c.currentGrade != null;
    if (changed && meaningful) {
      events.push({
        type: "course_grade_changed",
        occurredAt: now,
        courseId: id,
        courseName: c.name,
        title: c.name,
        url: null,
        summary: `Your ${c.name} grade moved: ${gradeStr(before.currentScore, before.currentGrade)} → ${gradeStr(
          c.currentScore,
          c.currentGrade
        )}.`,
        data: {
          previousScore: before.currentScore,
          previousGrade: before.currentGrade,
          score: c.currentScore,
          grade: c.currentGrade,
        },
      });
    }
  }

  return events;
}

export interface CheckResult {
  /** True on the very first run, when there was nothing to diff against. */
  baseline: boolean;
  events: SchoolEvent[];
  snapshot: Snapshot;
}

/** One poll: fetch, diff against saved state, persist the new state, return events. */
export async function checkEvents(provider: SchoolProvider, store: StateStore): Promise<CheckResult> {
  const prev = store.load();
  const { snapshot } = await buildSnapshot(provider);
  const events = prev ? diffSnapshots(prev, snapshot) : [];
  store.save(snapshot);
  return { baseline: !prev, events, snapshot };
}
