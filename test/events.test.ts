import { describe, expect, it } from "vitest";
import { diffSnapshots } from "../src/events.js";
import type { Snapshot } from "../src/types.js";

function baseSnapshot(): Snapshot {
  return {
    takenAt: "2026-08-17T00:00:00Z",
    courses: { "101": { name: "AP Biology", currentScore: 90, currentGrade: "A-" } },
    assignments: {
      "101:1": {
        courseId: "101",
        courseName: "AP Biology",
        name: "Lab 1",
        dueAt: "2026-08-20T04:00:00Z",
        pointsPossible: 50,
        url: null,
        score: null,
        grade: null,
        gradedAt: null,
      },
    },
    announcements: {
      "9": { courseId: "101", courseName: "AP Biology", title: "Welcome", postedAt: "2026-08-10T00:00:00Z", url: null },
    },
  };
}

describe("diffSnapshots", () => {
  it("returns no events for identical snapshots", () => {
    expect(diffSnapshots(baseSnapshot(), baseSnapshot())).toHaveLength(0);
  });

  it("detects a new assignment", () => {
    const next = baseSnapshot();
    next.assignments["101:2"] = {
      courseId: "101",
      courseName: "AP Biology",
      name: "Unit 4 Test",
      dueAt: "2026-08-25T04:00:00Z",
      pointsPossible: 100,
      url: null,
      score: null,
      grade: null,
      gradedAt: null,
    };
    const events = diffSnapshots(baseSnapshot(), next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("new_assignment");
    expect(events[0].summary).toContain("Unit 4 Test");
    expect(events[0].summary).toContain("AP Biology");
  });

  it("detects a due-date change", () => {
    const next = baseSnapshot();
    next.assignments["101:1"].dueAt = "2026-08-22T04:00:00Z";
    const events = diffSnapshots(baseSnapshot(), next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("due_date_changed");
    expect(events[0].data.previousDueAt).toBe("2026-08-20T04:00:00Z");
  });

  it("detects a newly posted grade", () => {
    const next = baseSnapshot();
    next.assignments["101:1"].score = 47;
    next.assignments["101:1"].grade = "47";
    next.assignments["101:1"].gradedAt = "2026-08-21T00:00:00Z";
    const events = diffSnapshots(baseSnapshot(), next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("grade_posted");
    expect(events[0].summary).toContain("47/50");
    expect(events[0].summary).toContain("94%");
  });

  it("detects a grade change", () => {
    const prev = baseSnapshot();
    prev.assignments["101:1"].score = 40;
    prev.assignments["101:1"].gradedAt = "2026-08-21T00:00:00Z";
    const next = baseSnapshot();
    next.assignments["101:1"].score = 45;
    next.assignments["101:1"].gradedAt = "2026-08-22T00:00:00Z";
    const events = diffSnapshots(prev, next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("grade_changed");
  });

  it("detects a new announcement", () => {
    const next = baseSnapshot();
    next.announcements["10"] = {
      courseId: "101",
      courseName: "AP Biology",
      title: "Test moved to Friday",
      postedAt: "2026-08-17T01:00:00Z",
      url: null,
    };
    const events = diffSnapshots(baseSnapshot(), next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("new_announcement");
  });

  it("detects a course grade move", () => {
    const next = baseSnapshot();
    next.courses["101"].currentScore = 92.5;
    next.courses["101"].currentGrade = "A";
    const events = diffSnapshots(baseSnapshot(), next);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("course_grade_changed");
    expect(events[0].summary).toContain("A-");
    expect(events[0].summary).toContain("A (92.5%)");
  });

  it("ignores courses that appear for the first time", () => {
    const next = baseSnapshot();
    next.courses["202"] = { name: "New Course", currentScore: 100, currentGrade: "A" };
    expect(diffSnapshots(baseSnapshot(), next)).toHaveLength(0);
  });
});
