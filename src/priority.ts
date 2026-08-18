import type { Assignment } from "./types.js";

const TEST_RE = /\b(test|exam|midterm|final|quiz|assessment)\b/i;

/**
 * A 0–100 urgency/importance hint for an assignment.
 * Weighs due-date proximity, point value, whether it looks like a test,
 * and missing/overdue status. Already-submitted work drops to near zero.
 *
 * This is a hint for AI agents to rank against, not a verdict — an agent
 * should override it with judgment (e.g. start a big essay before a
 * worksheet that happens to be due sooner).
 */
export function priorityScore(a: Assignment, now: Date = new Date()): number {
  const sub = a.submission;
  if (sub?.submittedAt || sub?.workflowState === "graded") return 5;

  let score = 0;
  if (!a.dueAt) {
    score += 8;
  } else {
    const hoursLeft = (new Date(a.dueAt).getTime() - now.getTime()) / 3_600_000;
    if (hoursLeft < 0) score += 45; // overdue and still open
    else if (hoursLeft <= 24) score += 50;
    else if (hoursLeft <= 48) score += 42;
    else if (hoursLeft <= 72) score += 34;
    else if (hoursLeft <= 120) score += 26;
    else if (hoursLeft <= 168) score += 20;
    else score += Math.max(4, 16 - Math.floor(hoursLeft / 168) * 4);
  }
  score += Math.min(25, Math.round((a.pointsPossible ?? 0) / 4)); // 100 pts ≈ +25
  if (a.isQuiz || TEST_RE.test(a.name)) score += 15;
  if (sub?.missing) score += 10;
  return Math.min(100, Math.round(score));
}

export function priorityLabel(score: number): "critical" | "high" | "medium" | "low" {
  if (score >= 70) return "critical";
  if (score >= 50) return "high";
  if (score >= 30) return "medium";
  return "low";
}
