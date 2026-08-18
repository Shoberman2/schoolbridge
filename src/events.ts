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
    discussions: {},
    calendarEvents: {},
    moduleItems: {},
    files: {},
    feedback: {},
  };
  const all: Assignment[] = [];

  const perCourse = await Promise.all(
    courses.map(async (c) => ({
      course: c,
      assignments: await provider.listAssignments(c),
      discussions: await provider.listDiscussions(c, 30),
      moduleItems: await provider.listModuleItems(c),
      files: await provider.listFiles(c, 30),
      feedback: await provider.listFeedback(c, 30),
    }))
  );
  for (const { course, assignments, discussions, moduleItems, files, feedback } of perCourse) {
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
    for (const d of discussions) {
      snapshot.discussions![d.id] = {
        courseId: d.courseId,
        courseName: d.courseName,
        title: d.title,
        postedAt: d.postedAt,
        url: d.url,
      };
    }
    for (const m of moduleItems) {
      snapshot.moduleItems![`${course.id}:${m.id}`] = {
        courseId: m.courseId,
        courseName: m.courseName,
        moduleName: m.moduleName,
        title: m.title,
        type: m.type,
        url: m.url,
      };
    }
    for (const f of files) {
      snapshot.files![f.id] = {
        courseId: f.courseId,
        courseName: f.courseName,
        name: f.name,
        createdAt: f.createdAt,
        url: f.url,
      };
    }
    for (const fb of feedback) {
      snapshot.feedback![fb.id] = {
        courseId: fb.courseId,
        courseName: fb.courseName,
        assignmentName: fb.assignmentName,
        author: fb.author,
        comment: fb.comment,
        createdAt: fb.createdAt,
        url: fb.url,
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
  for (const e of await provider.listCalendarEvents(courses, 7, 60)) {
    snapshot.calendarEvents![e.id] = {
      courseId: e.courseId,
      courseName: e.courseName,
      title: e.title,
      startAt: e.startAt,
      url: e.url,
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

  // For categories added after v0.2, a snapshot saved by an older version has
  // no map at all — treat that as the category's baseline pass (no events)
  // instead of flooding "new" events for everything that already existed.
  if (prev.discussions && next.discussions) {
    for (const [id, d] of Object.entries(next.discussions)) {
      if (prev.discussions[id]) continue;
      events.push({
        type: "new_discussion",
        occurredAt: now,
        courseId: d.courseId,
        courseName: d.courseName,
        title: d.title,
        url: d.url,
        summary: `New discussion in ${d.courseName}: “${d.title}”.`,
        data: { discussionId: id, postedAt: d.postedAt },
      });
    }
  }

  if (prev.calendarEvents && next.calendarEvents) {
    for (const [id, e] of Object.entries(next.calendarEvents)) {
      const before = prev.calendarEvents[id];
      if (!before) {
        events.push({
          type: "new_calendar_event",
          occurredAt: now,
          courseId: e.courseId,
          courseName: e.courseName,
          title: e.title,
          url: e.url,
          summary: `New event on the ${e.courseName} calendar: “${e.title}” (${fmtDateTime(e.startAt)}).`,
          data: { calendarEventId: id, startAt: e.startAt },
        });
      } else if (before.startAt !== e.startAt) {
        events.push({
          type: "calendar_event_changed",
          occurredAt: now,
          courseId: e.courseId,
          courseName: e.courseName,
          title: e.title,
          url: e.url,
          summary: `“${e.title}” on the ${e.courseName} calendar moved: ${fmtDateTime(
            before.startAt
          )} → ${fmtDateTime(e.startAt)}.`,
          data: { calendarEventId: id, previousStartAt: before.startAt, startAt: e.startAt },
        });
      }
    }
  }

  if (prev.moduleItems && next.moduleItems) {
    for (const [key, m] of Object.entries(next.moduleItems)) {
      if (prev.moduleItems[key]) continue;
      events.push({
        type: "new_module_item",
        occurredAt: now,
        courseId: m.courseId,
        courseName: m.courseName,
        title: m.title,
        url: m.url,
        summary: `New content in ${m.courseName}: “${m.title}” (${m.moduleName}).`,
        data: { moduleItemId: key.split(":")[1], moduleName: m.moduleName, itemType: m.type },
      });
    }
  }

  if (prev.files && next.files) {
    for (const [id, f] of Object.entries(next.files)) {
      if (prev.files[id]) continue;
      events.push({
        type: "new_file",
        occurredAt: now,
        courseId: f.courseId,
        courseName: f.courseName,
        title: f.name,
        url: f.url,
        summary: `New file in ${f.courseName}: ${f.name}.`,
        data: { fileId: id, createdAt: f.createdAt },
      });
    }
  }

  if (prev.feedback && next.feedback) {
    for (const [id, fb] of Object.entries(next.feedback)) {
      if (prev.feedback[id]) continue;
      const excerpt = fb.comment.length > 140 ? `${fb.comment.slice(0, 140)}…` : fb.comment;
      events.push({
        type: "new_feedback",
        occurredAt: now,
        courseId: fb.courseId,
        courseName: fb.courseName,
        title: fb.assignmentName,
        url: fb.url,
        summary: `New feedback${fb.author ? ` from ${fb.author}` : ""} on “${fb.assignmentName}” in ${
          fb.courseName
        }: “${excerpt}”`,
        data: { commentId: id, author: fb.author, comment: fb.comment, createdAt: fb.createdAt },
      });
    }
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
