/** Core domain types shared by every provider, the event engine, the CLI, and the MCP server. */

export interface Course {
  id: string;
  name: string;
  code: string | null;
  term: string | null;
  /** Current overall score as a percentage, e.g. 91.2 */
  currentScore: number | null;
  /** Current letter grade, e.g. "A-" */
  currentGrade: string | null;
  url: string | null;
}

export interface SubmissionInfo {
  submittedAt: string | null;
  gradedAt: string | null;
  score: number | null;
  grade: string | null;
  late: boolean;
  missing: boolean;
  workflowState: string;
}

export interface Assignment {
  id: string;
  courseId: string;
  courseName: string;
  name: string;
  dueAt: string | null;
  pointsPossible: number | null;
  url: string | null;
  submissionTypes: string[];
  /** True for online quizzes / quiz-backed assignments (often tests). */
  isQuiz: boolean;
  /** Plain-text instructions; only populated by getAssignment(). */
  description?: string | null;
  submission: SubmissionInfo | null;
}

export type AssignmentStatus = "unsubmitted" | "submitted" | "graded" | "missing" | "overdue";

/** An assignment decorated with ranking hints for agents. */
export interface RankedAssignment extends Assignment {
  /** 0–100 urgency/importance hint. Higher = do sooner. */
  priority: number;
  priorityLabel: "critical" | "high" | "medium" | "low";
  dueInHours: number | null;
  status: AssignmentStatus;
}

export interface Announcement {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  /** Plain text (HTML stripped). */
  message: string;
  postedAt: string | null;
  author: string | null;
  url: string | null;
}

export type SchoolEventType =
  | "new_assignment"
  | "due_date_changed"
  | "grade_posted"
  | "grade_changed"
  | "new_announcement"
  | "course_grade_changed";

/** A change detected between two polls. Uniform shape so agents can pattern-match on `type`. */
export interface SchoolEvent {
  type: SchoolEventType;
  /** When schoolbridge detected the change (ISO 8601). */
  occurredAt: string;
  courseId: string;
  courseName: string;
  /** Headline, e.g. the assignment or announcement title. */
  title: string;
  /** One human-readable sentence describing the change. */
  summary: string;
  url: string | null;
  /** Type-specific details (ids, before/after values, scores…). */
  data: Record<string, unknown>;
}

/** Persisted view of the LMS used to diff for events between polls. */
export interface Snapshot {
  takenAt: string;
  courses: Record<string, { name: string; currentScore: number | null; currentGrade: string | null }>;
  /** Keyed by `${courseId}:${assignmentId}`. */
  assignments: Record<
    string,
    {
      courseId: string;
      courseName: string;
      name: string;
      dueAt: string | null;
      pointsPossible: number | null;
      url: string | null;
      score: number | null;
      grade: string | null;
      gradedAt: string | null;
    }
  >;
  /** Keyed by announcement id. */
  announcements: Record<
    string,
    { courseId: string; courseName: string; title: string; postedAt: string | null; url: string | null }
  >;
}
