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
 * A credential-free provider with realistic sample data, for demos and tests.
 * All timestamps are relative to `now` so "upcoming" always looks alive.
 */
export class MockProvider implements SchoolProvider {
  readonly name = "mock";
  private readonly now: Date;

  constructor(now?: Date) {
    if (now) {
      this.now = now;
    } else {
      // Anchor to local midnight so repeated runs produce identical timestamps
      // and the event differ doesn't see phantom due-date changes.
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      this.now = d;
    }
  }

  private iso(hoursFromNow: number): string {
    return new Date(this.now.getTime() + hoursFromNow * 3_600_000).toISOString();
  }

  async listCourses(): Promise<Course[]> {
    return [
      { id: "101", name: "AP Biology", code: "BIO-AP", term: "Fall 2026", currentScore: 91.2, currentGrade: "A-", url: "https://canvas.example.edu/courses/101" },
      { id: "102", name: "US History", code: "HIST-11", term: "Fall 2026", currentScore: 84.5, currentGrade: "B", url: "https://canvas.example.edu/courses/102" },
      { id: "103", name: "Calculus AB", code: "MATH-AP", term: "Fall 2026", currentScore: 88.9, currentGrade: "B+", url: "https://canvas.example.edu/courses/103" },
    ];
  }

  private allAssignments(): Assignment[] {
    const unsubmitted = {
      submittedAt: null,
      gradedAt: null,
      score: null,
      grade: null,
      late: false,
      missing: false,
      workflowState: "unsubmitted",
    };
    return [
      {
        id: "5001",
        courseId: "101",
        courseName: "AP Biology",
        name: "Cell Respiration Lab Report",
        dueAt: this.iso(30),
        pointsPossible: 50,
        url: "https://canvas.example.edu/courses/101/assignments/5001",
        submissionTypes: ["online_upload"],
        isQuiz: false,
        description:
          "Write up the cellular respiration lab: hypothesis, procedure, data tables, and a conclusion connecting your CO2 measurements to the rate of respiration. 2–3 pages.",
        submission: { ...unsubmitted },
      },
      {
        id: "5002",
        courseId: "101",
        courseName: "AP Biology",
        name: "Unit 4 Test: Cellular Energetics",
        dueAt: this.iso(120),
        pointsPossible: 100,
        url: "https://canvas.example.edu/courses/101/assignments/5002",
        submissionTypes: ["online_quiz"],
        isQuiz: true,
        description:
          "Covers cellular respiration (glycolysis, Krebs cycle, oxidative phosphorylation), fermentation, and the light reactions of photosynthesis. 40 multiple choice + 2 FRQs. Bring a calculator.",
        submission: { ...unsubmitted },
      },
      {
        id: "6001",
        courseId: "102",
        courseName: "US History",
        name: "Reconstruction DBQ Essay",
        dueAt: this.iso(72),
        pointsPossible: 100,
        url: "https://canvas.example.edu/courses/102/assignments/6001",
        submissionTypes: ["online_upload"],
        isQuiz: false,
        description:
          "Document-based question: evaluate the successes and failures of Reconstruction (1865–1877) using at least 5 of the 7 provided documents plus outside evidence.",
        submission: { ...unsubmitted },
      },
      {
        id: "6002",
        courseId: "102",
        courseName: "US History",
        name: "Chapter 12 Reading Quiz",
        dueAt: this.iso(-20),
        pointsPossible: 10,
        url: "https://canvas.example.edu/courses/102/assignments/6002",
        submissionTypes: ["online_quiz"],
        isQuiz: true,
        description: "Short quiz on the Chapter 12 reading.",
        submission: { ...unsubmitted, missing: true },
      },
      {
        id: "7001",
        courseId: "103",
        courseName: "Calculus AB",
        name: "Problem Set 7",
        dueAt: this.iso(48),
        pointsPossible: 20,
        url: "https://canvas.example.edu/courses/103/assignments/7001",
        submissionTypes: ["online_upload"],
        isQuiz: false,
        description: "Related rates problems 1–12 from section 4.6.",
        submission: {
          submittedAt: this.iso(-3),
          gradedAt: null,
          score: null,
          grade: null,
          late: false,
          missing: false,
          workflowState: "submitted",
        },
      },
      {
        id: "7000",
        courseId: "103",
        courseName: "Calculus AB",
        name: "Problem Set 6",
        dueAt: this.iso(-120),
        pointsPossible: 20,
        url: "https://canvas.example.edu/courses/103/assignments/7000",
        submissionTypes: ["online_upload"],
        isQuiz: false,
        description: "Implicit differentiation problems from section 4.5.",
        submission: {
          submittedAt: this.iso(-125),
          gradedAt: this.iso(-30),
          score: 18,
          grade: "18",
          late: false,
          missing: false,
          workflowState: "graded",
        },
      },
    ];
  }

  async listAssignments(course: Course): Promise<Assignment[]> {
    // Strip descriptions on list calls, matching how the Canvas provider behaves.
    return this.allAssignments()
      .filter((a) => a.courseId === course.id)
      .map((a) => ({ ...a, description: undefined }));
  }

  async getAssignment(courseId: string, assignmentId: string): Promise<Assignment | null> {
    return this.allAssignments().find((a) => a.courseId === courseId && a.id === assignmentId) ?? null;
  }

  async listAnnouncements(courses: Course[], sinceDays: number): Promise<Announcement[]> {
    const all: Announcement[] = [
      {
        id: "9001",
        courseId: "101",
        courseName: "AP Biology",
        title: "Unit 4 review session Thursday",
        message:
          "Review session Thursday at lunch in room 214. The Unit 4 test is Friday — bring a pencil and a calculator. Practice FRQs are posted in Modules.",
        postedAt: this.iso(-6),
        author: "Ms. Rivera",
        url: "https://canvas.example.edu/courses/101/discussion_topics/9001",
      },
      {
        id: "9002",
        courseId: "102",
        courseName: "US History",
        title: "DBQ due Thursday + after-school help",
        message:
          "Reminder: Reconstruction DBQ essays are due Thursday at 11:59pm. I'll stay after school Wednesday for outlining help.",
        postedAt: this.iso(-30),
        author: "Mr. Adeyemi",
        url: "https://canvas.example.edu/courses/102/discussion_topics/9002",
      },
    ];
    const cutoff = this.now.getTime() - sinceDays * 86_400_000;
    const ids = new Set(courses.map((c) => c.id));
    return all.filter(
      (a) => ids.has(a.courseId) && (a.postedAt === null || new Date(a.postedAt).getTime() >= cutoff)
    );
  }

  async listDiscussions(course: Course, sinceDays: number): Promise<Discussion[]> {
    const all: Discussion[] = [
      {
        id: "9101",
        courseId: "101",
        courseName: "AP Biology",
        title: "Lab groups for the enzyme lab",
        message: "Post your top two partner choices here by Wednesday — groups of 3, first come first served.",
        postedAt: this.iso(-10),
        author: "Ms. Rivera",
        url: "https://canvas.example.edu/courses/101/discussion_topics/9101",
      },
    ];
    const cutoff = this.now.getTime() - sinceDays * 86_400_000;
    return all.filter(
      (d) => d.courseId === course.id && (d.postedAt === null || new Date(d.postedAt).getTime() >= cutoff)
    );
  }

  async listCalendarEvents(courses: Course[], daysBack: number, daysAhead: number): Promise<CalendarEvent[]> {
    const all: CalendarEvent[] = [
      {
        id: "9201",
        courseId: "101",
        courseName: "AP Biology",
        title: "Unit 4 review session",
        description: "Optional lunch review in room 214 before Friday's test.",
        startAt: this.iso(96),
        endAt: this.iso(97),
        location: "Room 214",
        url: "https://canvas.example.edu/calendar?event_id=9201",
      },
      {
        id: "9202",
        courseId: "102",
        courseName: "US History",
        title: "Museum field trip",
        description: "Meet at the main entrance at 8:15am. Bring your signed form.",
        startAt: this.iso(24 * 8),
        endAt: this.iso(24 * 8 + 6),
        location: "City History Museum",
        url: "https://canvas.example.edu/calendar?event_id=9202",
      },
    ];
    const start = this.now.getTime() - daysBack * 86_400_000;
    const end = this.now.getTime() + daysAhead * 86_400_000;
    const ids = new Set(courses.map((c) => c.id));
    return all.filter((e) => {
      if (!ids.has(e.courseId)) return false;
      const t = e.startAt ? new Date(e.startAt).getTime() : this.now.getTime();
      return t >= start && t <= end;
    });
  }

  async listModuleItems(course: Course): Promise<ModuleItemInfo[]> {
    const all: ModuleItemInfo[] = [
      {
        id: "9301",
        courseId: "101",
        courseName: "AP Biology",
        moduleName: "Unit 4: Cellular Energetics",
        title: "Unit 4 FRQ practice packet",
        type: "Page",
        url: "https://canvas.example.edu/courses/101/pages/unit-4-frq-practice",
      },
      {
        id: "9302",
        courseId: "103",
        courseName: "Calculus AB",
        moduleName: "Chapter 4: Derivatives in Context",
        title: "Related rates walkthrough video",
        type: "ExternalUrl",
        url: "https://video.example.edu/related-rates",
      },
    ];
    return all.filter((m) => m.courseId === course.id);
  }

  async listFiles(course: Course, sinceDays: number): Promise<CourseFile[]> {
    const all: CourseFile[] = [
      {
        id: "9401",
        courseId: "101",
        courseName: "AP Biology",
        name: "unit4_review_guide.pdf",
        createdAt: this.iso(-8),
        url: "https://canvas.example.edu/courses/101/files/9401",
      },
    ];
    const cutoff = this.now.getTime() - sinceDays * 86_400_000;
    return all.filter(
      (f) => f.courseId === course.id && (f.createdAt === null || new Date(f.createdAt).getTime() >= cutoff)
    );
  }

  async listFeedback(course: Course, sinceDays: number): Promise<FeedbackComment[]> {
    const all: FeedbackComment[] = [
      {
        id: "9501",
        courseId: "103",
        courseName: "Calculus AB",
        assignmentId: "7000",
        assignmentName: "Problem Set 6",
        author: "Mr. Chen",
        comment: "Nice work overall — watch your chain rule signs on #7, and show the implicit step on #10.",
        createdAt: this.iso(-28),
        url: "https://canvas.example.edu/courses/103/assignments/7000",
      },
    ];
    const cutoff = this.now.getTime() - sinceDays * 86_400_000;
    return all.filter(
      (f) => f.courseId === course.id && (f.createdAt === null || new Date(f.createdAt).getTime() >= cutoff)
    );
  }
}
