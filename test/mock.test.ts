import { describe, expect, it } from "vitest";
import { buildSnapshot, diffSnapshots } from "../src/events.js";
import { MockProvider } from "../src/providers/mock.js";
import { listUpcoming } from "../src/queries.js";

describe("MockProvider", () => {
  const provider = new MockProvider(new Date("2026-08-17T12:00:00Z"));

  it("builds a full snapshot", async () => {
    const { snapshot } = await buildSnapshot(provider);
    expect(Object.keys(snapshot.courses)).toHaveLength(3);
    expect(Object.keys(snapshot.assignments).length).toBeGreaterThanOrEqual(6);
    expect(Object.keys(snapshot.announcements).length).toBeGreaterThanOrEqual(2);
  });

  it("diffs to zero events against itself", async () => {
    const a = await buildSnapshot(provider);
    const b = await buildSnapshot(provider);
    expect(diffSnapshots(a.snapshot, b.snapshot)).toHaveLength(0);
  });

  it("ranks upcoming work sensibly", async () => {
    const items = await listUpcoming(provider, 7);
    expect(items.length).toBeGreaterThanOrEqual(4);
    // Sorted by priority, highest first.
    for (let i = 1; i < items.length; i++) {
      expect(items[i - 1].priority).toBeGreaterThanOrEqual(items[i].priority);
    }
    // The already-submitted problem set should rank below the unsubmitted lab report.
    const lab = items.find((a) => a.name.includes("Lab Report"))!;
    const submitted = items.find((a) => a.name === "Problem Set 7")!;
    expect(lab.priority).toBeGreaterThan(submitted.priority);
    expect(submitted.status).toBe("submitted");
    // The overdue quiz shows up as missing.
    const quiz = items.find((a) => a.name.includes("Chapter 12"))!;
    expect(quiz.status).toBe("missing");
  });

  it("returns assignment details with a description", async () => {
    const a = await provider.getAssignment("101", "5002");
    expect(a?.description).toContain("glycolysis");
  });
});
