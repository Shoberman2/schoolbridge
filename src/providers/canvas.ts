import { htmlToText } from "../html.js";
import type {
  Announcement,
  Assignment,
  CalendarEvent,
  Course,
  CourseFile,
  Discussion,
  FeedbackComment,
  ModuleItemInfo,
  SubmissionInfo,
} from "../types.js";
import type { CanvasOAuth } from "./canvasAuth.js";
import type { SchoolProvider } from "./provider.js";

export interface CanvasConfig {
  /** e.g. https://yourschool.instructure.com */
  baseUrl: string;
  /** A Canvas access token (Account → Settings → New Access Token). */
  token?: string;
  /** OAuth2 session (third-party app flow); used when no static token is set. */
  oauth?: CanvasOAuth;
}

/** Module item types that other event categories don't already cover. */
const MODULE_ITEM_TYPES = new Set(["Page", "File", "ExternalUrl", "ExternalTool"]);

/**
 * Canvas LMS provider, built on the Canvas REST API with either a student
 * access token or an OAuth2 session. Read-only: it never writes to Canvas.
 */
export class CanvasProvider implements SchoolProvider {
  readonly name = "canvas";
  private readonly base: string;

  constructor(private readonly cfg: CanvasConfig) {
    this.base = cfg.baseUrl.replace(/\/+$/, "");
    if (!cfg.token && !cfg.oauth) throw new Error("CanvasProvider needs a token or an OAuth session");
  }

  private async fetchPage<T>(pathOrUrl: string, retried = false): Promise<{ data: T; next: string | null }> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.base}/api/v1${pathOrUrl}`;
    const token = this.cfg.oauth && !this.cfg.token ? await this.cfg.oauth.getAccessToken() : this.cfg.token!;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (res.status === 401 && this.cfg.oauth && !this.cfg.token && !retried) {
      await this.cfg.oauth.refresh();
      return this.fetchPage<T>(pathOrUrl, true);
    }
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(
        `Canvas API ${res.status} ${res.statusText} for ${url}${body ? `: ${body.slice(0, 300)}` : ""}`
      );
    }
    const link = res.headers.get("link") ?? "";
    const m = /<([^>]+)>;\s*rel="next"/.exec(link);
    return { data: (await res.json()) as T, next: m ? m[1] : null };
  }

  private async fetchAll<T>(path: string): Promise<T[]> {
    const out: T[] = [];
    let url: string | null = path;
    while (url) {
      const page: { data: T[]; next: string | null } = await this.fetchPage<T[]>(url);
      out.push(...page.data);
      url = page.next;
    }
    return out;
  }

  /** Like fetchAll, but treats access denials as "surface disabled" → []. */
  private async fetchAllTolerant<T>(path: string): Promise<T[]> {
    try {
      return await this.fetchAll<T>(path);
    } catch (err) {
      if (/ (401|403|404) /.test(String(err))) return [];
      throw err;
    }
  }

  async listCourses(): Promise<Course[]> {
    const raw = await this.fetchAll<any>(
      "/courses?enrollment_state=active&per_page=100&include[]=total_scores&include[]=term"
    );
    return raw
      .filter((c) => c && c.name && !c.access_restricted_by_date)
      .map((c) => {
        const enrollments: any[] = Array.isArray(c.enrollments) ? c.enrollments : [];
        const enrollment =
          enrollments.find((e) => e.type === "student" || e.role === "StudentEnrollment") ?? enrollments[0];
        return {
          id: String(c.id),
          name: String(c.name),
          code: c.course_code ?? null,
          term: c.term?.name ?? null,
          currentScore: enrollment?.computed_current_score ?? null,
          currentGrade: enrollment?.computed_current_grade ?? null,
          url: `${this.base}/courses/${c.id}`,
        };
      });
  }

  async listAssignments(course: Course): Promise<Assignment[]> {
    const raw = await this.fetchAll<any>(
      `/courses/${course.id}/assignments?per_page=100&include[]=submission&order_by=due_at`
    );
    return raw.filter((a) => a && a.published !== false).map((a) => this.mapAssignment(a, course, false));
  }

  async getAssignment(courseId: string, assignmentId: string): Promise<Assignment | null> {
    try {
      const { data: c } = await this.fetchPage<any>(`/courses/${courseId}`);
      const { data: a } = await this.fetchPage<any>(
        `/courses/${courseId}/assignments/${assignmentId}?include[]=submission`
      );
      const course: Course = {
        id: String(c.id),
        name: String(c.name ?? "Unknown course"),
        code: c.course_code ?? null,
        term: null,
        currentScore: null,
        currentGrade: null,
        url: `${this.base}/courses/${c.id}`,
      };
      return this.mapAssignment(a, course, true);
    } catch (err) {
      if (String(err).includes(" 404 ")) return null;
      throw err;
    }
  }

  async listAnnouncements(courses: Course[], sinceDays: number): Promise<Announcement[]> {
    if (courses.length === 0) return [];
    const start = new Date(Date.now() - sinceDays * 86_400_000).toISOString().slice(0, 10);
    const nameById = new Map(courses.map((c) => [c.id, c.name]));
    const out: Announcement[] = [];
    // Chunk context codes to keep URLs a reasonable length.
    for (let i = 0; i < courses.length; i += 10) {
      const chunk = courses.slice(i, i + 10);
      const codes = chunk.map((c) => `context_codes[]=course_${c.id}`).join("&");
      const raw = await this.fetchAll<any>(`/announcements?${codes}&start_date=${start}&per_page=50`);
      for (const a of raw) {
        const courseId = String(a.context_code ?? "").replace("course_", "");
        out.push({
          id: String(a.id),
          courseId,
          courseName: nameById.get(courseId) ?? "Unknown course",
          title: a.title ?? "(untitled)",
          message: htmlToText(a.message ?? ""),
          postedAt: a.posted_at ?? null,
          author: a.author?.display_name ?? a.user_name ?? null,
          url: a.html_url ?? null,
        });
      }
    }
    out.sort((x, y) => (y.postedAt ?? "").localeCompare(x.postedAt ?? ""));
    return out;
  }

  async listDiscussions(course: Course, sinceDays: number): Promise<Discussion[]> {
    const cutoff = Date.now() - sinceDays * 86_400_000;
    const raw = await this.fetchAllTolerant<any>(
      `/courses/${course.id}/discussion_topics?per_page=50&order_by=recent_activity`
    );
    return raw
      .filter((d) => d && d.posted_at && new Date(d.posted_at).getTime() >= cutoff)
      .map((d) => ({
        id: String(d.id),
        courseId: course.id,
        courseName: course.name,
        title: d.title ?? "(untitled)",
        message: htmlToText(d.message ?? ""),
        postedAt: d.posted_at ?? null,
        author: d.author?.display_name ?? d.user_name ?? null,
        url: d.html_url ?? null,
      }));
  }

  async listCalendarEvents(courses: Course[], daysBack: number, daysAhead: number): Promise<CalendarEvent[]> {
    if (courses.length === 0) return [];
    const start = new Date(Date.now() - daysBack * 86_400_000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10);
    const nameById = new Map(courses.map((c) => [c.id, c.name]));
    const out: CalendarEvent[] = [];
    for (let i = 0; i < courses.length; i += 10) {
      const chunk = courses.slice(i, i + 10);
      const codes = chunk.map((c) => `context_codes[]=course_${c.id}`).join("&");
      const raw = await this.fetchAllTolerant<any>(
        `/calendar_events?type=event&${codes}&start_date=${start}&end_date=${end}&per_page=50`
      );
      for (const e of raw) {
        const courseId = String(e.context_code ?? "").replace("course_", "");
        out.push({
          id: String(e.id),
          courseId,
          courseName: nameById.get(courseId) ?? "Unknown course",
          title: e.title ?? "(untitled)",
          description: htmlToText(e.description ?? ""),
          startAt: e.start_at ?? null,
          endAt: e.end_at ?? null,
          location: e.location_name ?? null,
          url: e.html_url ?? null,
        });
      }
    }
    out.sort((x, y) => (x.startAt ?? "").localeCompare(y.startAt ?? ""));
    return out;
  }

  async listModuleItems(course: Course): Promise<ModuleItemInfo[]> {
    const modules = await this.fetchAllTolerant<any>(`/courses/${course.id}/modules?include[]=items&per_page=50`);
    const out: ModuleItemInfo[] = [];
    for (const m of modules) {
      if (!m || m.published === false) continue;
      for (const item of m.items ?? []) {
        // Assignments, quizzes, and discussions surface through their own
        // event categories — modules add the content-only item types.
        if (!item || item.published === false || !MODULE_ITEM_TYPES.has(item.type)) continue;
        out.push({
          id: String(item.id),
          courseId: course.id,
          courseName: course.name,
          moduleName: m.name ?? "(module)",
          title: item.title ?? "(untitled)",
          type: item.type,
          url: item.html_url ?? item.external_url ?? null,
        });
      }
    }
    return out;
  }

  async listFiles(course: Course, sinceDays: number): Promise<CourseFile[]> {
    const cutoff = Date.now() - sinceDays * 86_400_000;
    const raw = await this.fetchAllTolerant<any>(
      `/courses/${course.id}/files?per_page=50&sort=created_at&order=desc`
    );
    return raw
      .filter((f) => f && f.created_at && new Date(f.created_at).getTime() >= cutoff)
      .map((f) => ({
        id: String(f.id),
        courseId: course.id,
        courseName: course.name,
        name: f.display_name ?? f.filename ?? "(file)",
        createdAt: f.created_at ?? null,
        url: f.url ?? null,
      }));
  }

  async listFeedback(course: Course, sinceDays: number): Promise<FeedbackComment[]> {
    const cutoff = Date.now() - sinceDays * 86_400_000;
    const raw = await this.fetchAllTolerant<any>(
      `/courses/${course.id}/students/submissions?student_ids[]=self&include[]=submission_comments&include[]=assignment&per_page=100`
    );
    const out: FeedbackComment[] = [];
    for (const sub of raw) {
      if (!sub) continue;
      for (const c of sub.submission_comments ?? []) {
        if (!c?.comment) continue;
        if (c.created_at && new Date(c.created_at).getTime() < cutoff) continue;
        // Skip the student's own comments — only teacher/TA feedback is news.
        if (c.author_id != null && sub.user_id != null && c.author_id === sub.user_id) continue;
        out.push({
          id: String(c.id),
          courseId: course.id,
          courseName: course.name,
          assignmentId: String(sub.assignment_id ?? ""),
          assignmentName: sub.assignment?.name ?? "(assignment)",
          author: c.author_name ?? null,
          comment: htmlToText(String(c.comment)),
          createdAt: c.created_at ?? null,
          url: sub.assignment?.html_url ?? null,
        });
      }
    }
    out.sort((x, y) => (y.createdAt ?? "").localeCompare(x.createdAt ?? ""));
    return out;
  }

  private mapAssignment(a: any, course: Course, includeDescription: boolean): Assignment {
    const sub = a.submission ?? null;
    const submission: SubmissionInfo | null = sub
      ? {
          submittedAt: sub.submitted_at ?? null,
          gradedAt: sub.graded_at ?? null,
          score: sub.score ?? null,
          grade: sub.grade ?? null,
          late: Boolean(sub.late),
          missing: Boolean(sub.missing),
          workflowState: sub.workflow_state ?? "unsubmitted",
        }
      : null;
    const submissionTypes: string[] = Array.isArray(a.submission_types) ? a.submission_types : [];
    return {
      id: String(a.id),
      courseId: course.id,
      courseName: course.name,
      name: String(a.name ?? "(untitled)"),
      dueAt: a.due_at ?? null,
      pointsPossible: a.points_possible ?? null,
      url: a.html_url ?? null,
      submissionTypes,
      isQuiz: Boolean(a.is_quiz_assignment) || submissionTypes.includes("online_quiz"),
      description: includeDescription ? htmlToText(a.description ?? "") : undefined,
      submission,
    };
  }
}
