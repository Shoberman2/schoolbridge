import { describe, expect, it } from "vitest";
import { priorityLabel, priorityScore } from "../src/priority.js";
import type { Assignment } from "../src/types.js";

const now = new Date("2026-08-17T12:00:00Z");

function assignment(overrides: Partial<Assignment>): Assignment {
  return {
    id: "1",
    courseId: "101",
    courseName: "Test Course",
    name: "Worksheet",
    dueAt: null,
    pointsPossible: 10,
    url: null,
    submissionTypes: [],
    isQuiz: false,
    submission: null,
    ...overrides,
  };
}

describe("priorityScore", () => {
  it("scores near-due work higher than far-out work", () => {
    const soon = priorityScore(assignment({ dueAt: "2026-08-18T00:00:00Z" }), now);
    const later = priorityScore(assignment({ dueAt: "2026-08-30T00:00:00Z" }), now);
    expect(soon).toBeGreaterThan(later);
  });

  it("boosts tests over same-due-date homework", () => {
    const hw = priorityScore(assignment({ dueAt: "2026-08-19T00:00:00Z" }), now);
    const test = priorityScore(assignment({ dueAt: "2026-08-19T00:00:00Z", name: "Unit 4 Test" }), now);
    expect(test).toBeGreaterThan(hw);
  });

  it("boosts higher point values", () => {
    const small = priorityScore(assignment({ dueAt: "2026-08-19T00:00:00Z", pointsPossible: 10 }), now);
    const big = priorityScore(assignment({ dueAt: "2026-08-19T00:00:00Z", pointsPossible: 100 }), now);
    expect(big).toBeGreaterThan(small);
  });

  it("drops already-submitted work to near zero", () => {
    const submitted = priorityScore(
      assignment({
        dueAt: "2026-08-18T00:00:00Z",
        submission: {
          submittedAt: "2026-08-16T00:00:00Z",
          gradedAt: null,
          score: null,
          grade: null,
          late: false,
          missing: false,
          workflowState: "submitted",
        },
      }),
      now
    );
    expect(submitted).toBeLessThanOrEqual(10);
  });

  it("keeps overdue missing work urgent", () => {
    const missing = priorityScore(
      assignment({
        dueAt: "2026-08-16T00:00:00Z",
        submission: {
          submittedAt: null,
          gradedAt: null,
          score: null,
          grade: null,
          late: false,
          missing: true,
          workflowState: "unsubmitted",
        },
      }),
      now
    );
    expect(missing).toBeGreaterThanOrEqual(50);
  });
});

describe("priorityLabel", () => {
  it("maps scores to bands", () => {
    expect(priorityLabel(80)).toBe("critical");
    expect(priorityLabel(55)).toBe("high");
    expect(priorityLabel(35)).toBe("medium");
    expect(priorityLabel(10)).toBe("low");
  });
});
