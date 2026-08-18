import { priorityLabel, priorityScore } from "./priority.js";
import type { SchoolProvider } from "./providers/provider.js";
import type { Assignment, Course, RankedAssignment } from "./types.js";

export function decorateAssignment(a: Assignment, now: Date = new Date()): RankedAssignment {
  const p = priorityScore(a, now);
  const dueInHours = a.dueAt
    ? Math.round(((new Date(a.dueAt).getTime() - now.getTime()) / 3_600_000) * 10) / 10
    : null;
  const s = a.submission;
  let status: RankedAssignment["status"] = "unsubmitted";
  if (s?.gradedAt != null || s?.workflowState === "graded") status = "graded";
  else if (s?.submittedAt) status = "submitted";
  else if (s?.missing) status = "missing";
  else if (a.dueAt && new Date(a.dueAt) < now) status = "overdue";
  return { ...a, priority: p, priorityLabel: priorityLabel(p), dueInHours, status };
}

/**
 * Work due within the next `days` days across all courses, plus anything from
 * the past two weeks that is overdue and still unsubmitted. Sorted by priority
 * (highest first) so an agent can present it as a ranked list.
 */
export async function listUpcoming(provider: SchoolProvider, days = 7): Promise<RankedAssignment[]> {
  const now = new Date();
  const horizon = now.getTime() + days * 86_400_000;
  const overdueWindow = now.getTime() - 14 * 86_400_000;
  const courses = await provider.listCourses();
  const perCourse = await Promise.all(courses.map((c) => provider.listAssignments(c)));

  const out: RankedAssignment[] = [];
  for (const assignments of perCourse) {
    for (const a of assignments) {
      if (!a.dueAt) continue;
      const t = new Date(a.dueAt).getTime();
      const submittedOrGraded = Boolean(a.submission?.submittedAt) || a.submission?.score != null;
      const isUpcoming = t >= now.getTime() && t <= horizon;
      const isOverdueOpen = t < now.getTime() && t >= overdueWindow && !submittedOrGraded;
      if (isUpcoming || isOverdueOpen) out.push(decorateAssignment(a, now));
    }
  }
  out.sort((x, y) => y.priority - x.priority || (x.dueAt ?? "").localeCompare(y.dueAt ?? ""));
  return out;
}

export interface GradedItem {
  courseId: string;
  courseName: string;
  assignmentId: string;
  name: string;
  score: number | null;
  grade: string | null;
  pointsPossible: number | null;
  gradedAt: string | null;
  url: string | null;
}

export interface GradeReport {
  courses: Course[];
  /** Items graded within the report window, newest first. */
  recentlyGraded: GradedItem[];
}

/** Current course grades plus everything graded in the last `recentDays` days. */
export async function getGrades(provider: SchoolProvider, recentDays = 14): Promise<GradeReport> {
  const courses = await provider.listCourses();
  const perCourse = await Promise.all(courses.map((c) => provider.listAssignments(c)));
  const cutoff = Date.now() - recentDays * 86_400_000;

  const recentlyGraded: GradedItem[] = [];
  for (const assignments of perCourse) {
    for (const a of assignments) {
      const g = a.submission?.gradedAt;
      if (!g || new Date(g).getTime() < cutoff) continue;
      recentlyGraded.push({
        courseId: a.courseId,
        courseName: a.courseName,
        assignmentId: a.id,
        name: a.name,
        score: a.submission?.score ?? null,
        grade: a.submission?.grade ?? null,
        pointsPossible: a.pointsPossible,
        gradedAt: g,
        url: a.url,
      });
    }
  }
  recentlyGraded.sort((x, y) => (y.gradedAt ?? "").localeCompare(x.gradedAt ?? ""));
  return { courses, recentlyGraded };
}
