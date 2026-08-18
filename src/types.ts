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

export interface Discussion {
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

export interface CalendarEvent {
  id: string;
  courseId: string;
  courseName: string;
  title: string;
  description: string;
  startAt: string | null;
  endAt: string | null;
  location: string | null;
  url: string | null;
}

export interface ModuleItemInfo {
  id: string;
  courseId: string;
  courseName: string;
  moduleName: string;
  title: string;
  /** e.g. "Page", "File", "ExternalUrl" */
  type: string;
  url: string | null;
}

export interface CourseFile {
  id: string;
  courseId: string;
  courseName: string;
  name: string;
  createdAt: string | null;
  url: string | null;
}

/** A teacher's comment on the student's submission. */
export interface FeedbackComment {
  id: string;
  courseId: string;
  courseName: string;
  assignmentId: string;
  assignmentName: string;
  author: string | null;
  comment: string;
  createdAt: string | null;
  url: string | null;
}

export type SchoolEventType =
  | "new_assignment"
  | "due_date_changed"
  | "grade_posted"
  | "grade_changed"
  | "new_announcement"
  | "course_grade_changed"
  | "new_discussion"
  | "new_calendar_event"
  | "calendar_event_changed"
  | "new_module_item"
  | "new_file"
  | "new_feedback";

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
  /**
   * The categories below are optional so snapshots saved by older versions
   * still load; the differ treats a missing category as its baseline pass.
   */
  discussions?: Record<
    string,
    { courseId: string; courseName: string; title: string; postedAt: string | null; url: string | null }
  >;
  /** Keyed by calendar event id. */
  calendarEvents?: Record<
    string,
    { courseId: string; courseName: string; title: string; startAt: string | null; url: string | null }
  >;
  /** Keyed by `${courseId}:${itemId}`. */
  moduleItems?: Record<
    string,
    { courseId: string; courseName: string; moduleName: string; title: string; type: string; url: string | null }
  >;
  /** Keyed by file id. */
  files?: Record<
    string,
    { courseId: string; courseName: string; name: string; createdAt: string | null; url: string | null }
  >;
  /** Keyed by submission-comment id. */
  feedback?: Record<
    string,
    {
      courseId: string;
      courseName: string;
      assignmentName: string;
      author: string | null;
      comment: string;
      createdAt: string | null;
      url: string | null;
    }
  >;
}
