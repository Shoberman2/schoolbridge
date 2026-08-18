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

/**
 * The contract every school-platform integration implements.
 * Canvas is the reference implementation; see docs/PROVIDERS.md for how to add
 * Google Classroom, Schoology, Moodle, PowerSchool, etc.
 *
 * Methods for surfaces an institution may disable (files, modules, feedback…)
 * should return [] rather than throw when access is denied.
 */
export interface SchoolProvider {
  readonly name: string;
  /** Active courses for the authenticated student, with current grades when available. */
  listCourses(): Promise<Course[]>;
  /** All visible assignments for a course, including the student's submission state. */
  listAssignments(course: Course): Promise<Assignment[]>;
  /** One assignment with its full plain-text description, or null if not found. */
  getAssignment(courseId: string, assignmentId: string): Promise<Assignment | null>;
  /** Announcements across the given courses posted within the last `sinceDays` days, newest first. */
  listAnnouncements(courses: Course[], sinceDays: number): Promise<Announcement[]>;
  /** Non-announcement discussion topics posted within the last `sinceDays` days. */
  listDiscussions(course: Course, sinceDays: number): Promise<Discussion[]>;
  /** Course calendar events from `daysBack` days ago through `daysAhead` days from now. */
  listCalendarEvents(courses: Course[], daysBack: number, daysAhead: number): Promise<CalendarEvent[]>;
  /** Published module items (course content) visible to the student. */
  listModuleItems(course: Course): Promise<ModuleItemInfo[]>;
  /** Course files created within the last `sinceDays` days. */
  listFiles(course: Course, sinceDays: number): Promise<CourseFile[]>;
  /** Teacher comments on the student's submissions from the last `sinceDays` days. */
  listFeedback(course: Course, sinceDays: number): Promise<FeedbackComment[]>;
}
