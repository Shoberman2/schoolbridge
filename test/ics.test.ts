import { afterEach, describe, expect, it, vi } from "vitest";
import { parseIcs } from "../src/ics.js";
import { IcsProvider } from "../src/providers/ics.js";

// A realistic Canvas calendar feed: folded lines, escaped commas, an
// assignment (UTC timestamp), an all-day assignment, and a calendar event.
const FEED = [
  "BEGIN:VCALENDAR",
  "VERSION:2.0",
  "PRODID:-//Instructure//Canvas//EN",
  "BEGIN:VEVENT",
  "UID:event-assignment-5002",
  "SUMMARY:Unit 4 Test: Cellular Energetics [AP Biology]",
  "DTSTART:20260822T140000Z",
  "DESCRIPTION:Covers cellular respiration\\, fermentation\\, and photosynthesi",
  " s light reactions. 40 MC + 2 FRQs.",
  "URL:https://canvas.example.edu/courses/101/assignments/5002",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:event-assignment-6001",
  "SUMMARY:Reconstruction DBQ Essay [US History]",
  "DTSTART;VALUE=DATE:20260820",
  "URL:https://canvas.example.edu/courses/102/assignments/6001",
  "END:VEVENT",
  "BEGIN:VEVENT",
  "UID:event-calendar-event-9201",
  "SUMMARY:Unit 4 review session [AP Biology]",
  "DTSTART:20260821T160000Z",
  "DTEND:20260821T170000Z",
  "LOCATION:Room 214",
  "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

afterEach(() => vi.unstubAllGlobals());

describe("parseIcs", () => {
  it("parses events, unfolds lines, and unescapes text", () => {
    const events = parseIcs(FEED);
    expect(events).toHaveLength(3);
    expect(events[0].summary).toBe("Unit 4 Test: Cellular Energetics [AP Biology]");
    expect(events[0].description).toContain("respiration, fermentation, and photosynthesis light reactions");
    expect(events[0].startAt).toBe("2026-08-22T14:00:00.000Z");
    expect(events[0].allDay).toBe(false);
    expect(events[1].allDay).toBe(true);
    expect(events[2].location).toBe("Room 214");
  });
});

describe("IcsProvider", () => {
  function stubFeed() {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => FEED }) as any));
  }

  it("derives courses, assignments, and calendar events from the feed", async () => {
    stubFeed();
    const provider = new IcsProvider("https://canvas.example.edu/feeds/calendars/user_abc.ics");
    const courses = await provider.listCourses();
    expect(courses.map((c) => c.name).sort()).toEqual(["AP Biology", "US History"]);

    const bio = courses.find((c) => c.name === "AP Biology")!;
    const assignments = await provider.listAssignments(bio);
    expect(assignments).toHaveLength(1);
    expect(assignments[0].name).toBe("Unit 4 Test: Cellular Energetics");
    expect(assignments[0].dueAt).toBe("2026-08-22T14:00:00.000Z");

    const events = await provider.listCalendarEvents(courses, 36500, 36500);
    expect(events).toHaveLength(1);
    expect(events[0].title).toBe("Unit 4 review session");
    expect(events[0].location).toBe("Room 214");
  });

  it("treats all-day due dates as end of day and serves descriptions via getAssignment", async () => {
    stubFeed();
    const provider = new IcsProvider("https://x.example/feed.ics");
    const hist = (await provider.listCourses()).find((c) => c.name === "US History")!;
    const [dbq] = await provider.listAssignments(hist);
    expect(new Date(dbq.dueAt!).getHours()).toBe(23);

    const full = await provider.getAssignment("ap-biology", "5002");
    expect(full?.description).toContain("40 MC + 2 FRQs");
    // Empty surfaces stay empty rather than throwing.
    expect(await provider.listFeedback()).toEqual([]);
  });
});
