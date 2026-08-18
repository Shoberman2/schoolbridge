import type { Announcement, Assignment, Course } from "../types.js";

/**
 * The contract every school-platform integration implements.
 * Canvas is the reference implementation; see docs/PROVIDERS.md for how to add
 * Google Classroom, Schoology, Moodle, PowerSchool, etc.
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
}
