import { htmlToText } from "../html.js";
import type { Announcement, Assignment, Course, SubmissionInfo } from "../types.js";
import type { SchoolProvider } from "./provider.js";

export interface CanvasConfig {
  /** e.g. https://yourschool.instructure.com */
  baseUrl: string;
  /** A Canvas access token (Account → Settings → New Access Token). */
  token: string;
}

/**
 * Canvas LMS provider, built on the Canvas REST API with a student access token.
 * Read-only: it never writes anything back to Canvas.
 */
export class CanvasProvider implements SchoolProvider {
  readonly name = "canvas";
  private readonly base: string;
  private readonly token: string;

  constructor(cfg: CanvasConfig) {
    this.base = cfg.baseUrl.replace(/\/+$/, "");
    this.token = cfg.token;
  }

  private async fetchPage<T>(pathOrUrl: string): Promise<{ data: T; next: string | null }> {
    const url = pathOrUrl.startsWith("http") ? pathOrUrl : `${this.base}/api/v1${pathOrUrl}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
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
