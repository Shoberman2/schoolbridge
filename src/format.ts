import type { Announcement, Course, RankedAssignment, SchoolEvent } from "./types.js";
import type { GradeReport } from "./queries.js";

export function fmtDateTime(iso: string | null): string {
  if (!iso) return "no due date";
  return new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function dueIn(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "no due date";
  const ms = new Date(iso).getTime() - now.getTime();
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hours = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  const chunk = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
  return ms < 0 ? `overdue by ${chunk}` : `due in ${chunk}`;
}

export function gradeStr(score: number | null, grade: string | null): string {
  if (grade && score != null) return `${grade} (${score}%)`;
  if (grade) return grade;
  if (score != null) return `${score}%`;
  return "no grade yet";
}

export function renderCourses(courses: Course[]): string {
  if (!courses.length) return "No active courses found.";
  return courses
    .map((c) => `• ${c.name}${c.code ? ` (${c.code})` : ""} — ${gradeStr(c.currentScore, c.currentGrade)}`)
    .join("\n");
}

export function renderUpcoming(items: RankedAssignment[], now: Date = new Date()): string {
  if (!items.length) return "Nothing due in this window.";
  return items
    .map((a, i) => {
      const pts = a.pointsPossible != null ? `${a.pointsPossible} pts` : "ungraded";
      const head = `${String(i + 1).padStart(2)}. [${a.priorityLabel.toUpperCase()} ${a.priority}] ${a.name}`;
      const detail = `    ${a.courseName} · ${dueIn(a.dueAt, now)} (${fmtDateTime(a.dueAt)}) · ${pts} · ${a.status}`;
      return `${head}\n${detail}`;
    })
    .join("\n");
}

export function renderAnnouncements(items: Announcement[]): string {
  if (!items.length) return "No recent announcements.";
  return items
    .map((a) => {
      const when = a.postedAt ? fmtDateTime(a.postedAt) : "unknown time";
      const preview = a.message.length > 200 ? `${a.message.slice(0, 200)}…` : a.message;
      const byline = a.author ? ` — ${a.author}` : "";
      return `• [${when}] ${a.courseName}: ${a.title}${byline}\n    ${preview.replace(/\n+/g, " ")}`;
    })
    .join("\n");
}

export function renderEvents(events: SchoolEvent[]): string {
  if (!events.length) return "No new activity since last check.";
  return events.map((e) => `• ${e.summary}`).join("\n");
}

export function renderGrades(report: GradeReport): string {
  const lines = [renderCourses(report.courses)];
  if (report.recentlyGraded.length) {
    lines.push("", "Recently graded:");
    for (const g of report.recentlyGraded) {
      const scored =
        g.score != null && g.pointsPossible
          ? `${g.score}/${g.pointsPossible} (${Math.round((g.score / g.pointsPossible) * 1000) / 10}%)`
          : g.grade ?? "graded";
      lines.push(`• ${g.courseName} — ${g.name}: ${scored}, graded ${fmtDateTime(g.gradedAt)}`);
    }
  }
  return lines.join("\n");
}

export function renderCalendar(events: import("./types.js").CalendarEvent[]): string {
  if (!events.length) return "No upcoming calendar events.";
  return events
    .map((e) => {
      const when = e.startAt ? fmtDateTime(e.startAt) : "unscheduled";
      const where = e.location ? ` @ ${e.location}` : "";
      return `• [${when}] ${e.courseName}: ${e.title}${where}`;
    })
    .join("\n");
}

export function renderFeedback(items: import("./types.js").FeedbackComment[]): string {
  if (!items.length) return "No recent feedback from teachers.";
  return items
    .map((f) => {
      const when = f.createdAt ? fmtDateTime(f.createdAt) : "unknown time";
      const by = f.author ? ` — ${f.author}` : "";
      return `• [${when}] ${f.courseName} · ${f.assignmentName}${by}\n    ${f.comment.replace(/\n+/g, " ")}`;
    })
    .join("\n");
}

export function renderAssignment(a: RankedAssignment): string {
  const lines = [
    a.name,
    `Course:   ${a.courseName}`,
    `Due:      ${fmtDateTime(a.dueAt)} (${dueIn(a.dueAt)})`,
    `Points:   ${a.pointsPossible ?? "ungraded"} · Status: ${a.status} · Priority: ${a.priority} (${a.priorityLabel})`,
  ];
  if (a.url) lines.push(`URL:      ${a.url}`);
  if (a.description) lines.push("", a.description);
  return lines.join("\n");
}
