import { parseIcs, type IcsEvent } from "../ics.js";
import type {
  Announcement,
  Assignment,
  CalendarEvent,
  Course,
  CourseFile,
  Discussion,
  FeedbackComment,
  ModuleItemInfo,
} from "../types.js";
import type { SchoolProvider } from "./provider.js";

/**
 * Zero-credential provider backed by a Canvas calendar feed (ICS URL).
 * Every Canvas user has one — Calendar → "Calendar Feed" — even at
 * institutions that disable student access tokens.
 *
 * Coverage is honest but partial: assignments with due dates and calendar
 * events (so upcoming/ranking/planning and new-assignment / due-date-change /
 * calendar-event detection all work). The feed carries no grades,
 * announcements, submissions, files, or feedback — those return empty.
 */
export class IcsProvider implements SchoolProvider {
  readonly name = "ics";
  private cache: IcsEvent[] | null = null;

  constructor(private readonly feedUrl: string) {}

  private async load(): Promise<IcsEvent[]> {
    if (this.cache) return this.cache;
    const res = await fetch(this.feedUrl);
    if (!res.ok) {
      throw new Error(
        `Calendar feed HTTP ${res.status} — double-check the URL from Canvas → Calendar → "Calendar Feed" (ends in .ics)`
      );
    }
    this.cache = parseIcs(await res.text());
    return this.cache;
  }

  /** Canvas summaries look like "Assignment Title [Course Name]". */
  private split(e: IcsEvent): { title: string; courseName: string } {
    const m = /^(.*?)\s*\[([^\]]+)\]\s*$/.exec(e.summary);
    return m ? { title: m[1] || e.summary, courseName: m[2] } : { title: e.summary, courseName: "Canvas" };
  }

  private courseId(courseName: string): string {
    return courseName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "canvas";
  }

  private isAssignment(e: IcsEvent): boolean {
    return /assignment/i.test(e.uid);
  }

  private eventId(e: IcsEvent): string {
    const m = /(\d+)/.exec(e.uid);
    return m ? m[1] : e.uid || e.summary;
  }

  /** All-day due dates mean "end of that day". */
  private dueAt(e: IcsEvent): string | null {
    if (!e.startAt) return null;
    if (!e.allDay) return e.startAt;
    const d = new Date(e.startAt);
    d.setHours(23, 59, 0, 0);
    return d.toISOString();
  }

  private toAssignment(e: IcsEvent, includeDescription: boolean): Assignment {
    const { title, courseName } = this.split(e);
    return {
      id: this.eventId(e),
      courseId: this.courseId(courseName),
      courseName,
      name: title,
      dueAt: this.dueAt(e),
      pointsPossible: null, // the feed doesn't carry points
      url: e.url,
      submissionTypes: [],
      isQuiz: false, // priority still test-boosts by name matching
      description: includeDescription ? e.description : undefined,
      submission: null, // no submission state in the feed
    };
  }

  async listCourses(): Promise<Course[]> {
    const names = new Map<string, string>();
    for (const e of await this.load()) {
      const { courseName } = this.split(e);
      names.set(this.courseId(courseName), courseName);
    }
    return [...names.entries()].map(([id, name]) => ({
      id,
      name,
      code: null,
      term: null,
      currentScore: null, // feed has no grades
      currentGrade: null,
      url: null,
    }));
  }

  async listAssignments(course: Course): Promise<Assignment[]> {
    const events = await this.load();
    return events
      .filter((e) => this.isAssignment(e) && this.courseId(this.split(e).courseName) === course.id)
      .map((e) => this.toAssignment(e, false));
  }

  async getAssignment(courseId: string, assignmentId: string): Promise<Assignment | null> {
    const events = await this.load();
    const hit = events.find(
      (e) =>
        this.isAssignment(e) &&
        this.eventId(e) === assignmentId &&
        this.courseId(this.split(e).courseName) === courseId
    );
    return hit ? this.toAssignment(hit, true) : null;
  }

  async listCalendarEvents(courses: Course[], daysBack: number, daysAhead: number): Promise<CalendarEvent[]> {
    const start = Date.now() - daysBack * 86_400_000;
    const end = Date.now() + daysAhead * 86_400_000;
    const ids = new Set(courses.map((c) => c.id));
    const out: CalendarEvent[] = [];
    for (const e of await this.load()) {
      if (this.isAssignment(e) || !e.startAt) continue;
      const { title, courseName } = this.split(e);
      const courseId = this.courseId(courseName);
      if (!ids.has(courseId)) continue;
      const t = new Date(e.startAt).getTime();
      if (t < start || t > end) continue;
      out.push({
        id: this.eventId(e),
        courseId,
        courseName,
        title,
        description: e.description,
        startAt: e.startAt,
        endAt: e.endAt,
        location: e.location,
        url: e.url,
      });
    }
    out.sort((x, y) => (x.startAt ?? "").localeCompare(y.startAt ?? ""));
    return out;
  }

  // The calendar feed doesn't carry these surfaces.
  async listAnnouncements(): Promise<Announcement[]> {
    return [];
  }
  async listDiscussions(): Promise<Discussion[]> {
    return [];
  }
  async listModuleItems(): Promise<ModuleItemInfo[]> {
    return [];
  }
  async listFiles(): Promise<CourseFile[]> {
    return [];
  }
  async listFeedback(): Promise<FeedbackComment[]> {
    return [];
  }
}
