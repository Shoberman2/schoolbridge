import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkEvents } from "./events.js";
import type { SchoolProvider } from "./providers/provider.js";
import { decorateAssignment, getGrades, listUpcoming } from "./queries.js";
import type { StateStore } from "./state.js";
import { VERSION } from "./version.js";

/**
 * The schoolbridge MCP server: read-only tools over the student's LMS plus
 * prompts for the common "brief me / plan my week / study plan" flows.
 * Works with Claude Code, Claude Desktop, Claude Cowork, and any MCP client.
 */
export function createMcpServer(provider: SchoolProvider, store: StateStore): McpServer {
  const server = new McpServer({ name: "schoolbridge", version: VERSION });
  const json = (v: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(v, null, 2) }] });

  server.registerTool(
    "list_courses",
    {
      title: "List courses",
      description: "List the student's active courses with the current grade and score for each.",
    },
    async () => json(await provider.listCourses())
  );

  server.registerTool(
    "list_upcoming_work",
    {
      title: "List upcoming work",
      description:
        "Assignments, quizzes, and tests due in the next N days (default 7) across all courses, plus recent overdue unsubmitted work. Each item carries a 0–100 `priority` hint that weighs due date, point value, test-likeness, and missing status — use it as a starting point for ranking, but override it with judgment (e.g. start long essays earlier than their due date suggests).",
      inputSchema: {
        days: z.number().int().min(1).max(60).optional().describe("Lookahead window in days (default 7)"),
      },
    },
    async ({ days }) => json(await listUpcoming(provider, days ?? 7))
  );

  server.registerTool(
    "get_assignment_details",
    {
      title: "Get assignment details",
      description:
        "Full details for one assignment, including its description/instructions as plain text. Use this before building a study plan or estimating effort.",
      inputSchema: {
        course_id: z.string().describe("Course id, from list_courses or list_upcoming_work"),
        assignment_id: z.string().describe("Assignment id, from list_upcoming_work"),
      },
    },
    async ({ course_id, assignment_id }) => {
      const a = await provider.getAssignment(course_id, assignment_id);
      return a ? json(decorateAssignment(a)) : json({ error: `Assignment ${assignment_id} not found in course ${course_id}` });
    }
  );

  server.registerTool(
    "list_announcements",
    {
      title: "List announcements",
      description: "Teacher announcements across all courses from the last N days (default 14), newest first.",
      inputSchema: {
        days: z.number().int().min(1).max(90).optional().describe("How many days back to look (default 14)"),
      },
    },
    async ({ days }) => json(await provider.listAnnouncements(await provider.listCourses(), days ?? 14))
  );

  server.registerTool(
    "get_grades",
    {
      title: "Get grades",
      description:
        "Current overall grade per course plus every assignment graded in the last two weeks (with scores).",
    },
    async () => json(await getGrades(provider))
  );

  server.registerTool(
    "check_new_events",
    {
      title: "Check for new events",
      description:
        "Compare the LMS with the last check and return everything that changed since: new assignments, due-date changes, newly posted or changed grades, new announcements, and course-grade moves. Persists the new state, so each call reports only fresh changes. The first call ever returns baseline=true with no events.",
    },
    async () => {
      const r = await checkEvents(provider, store);
      return json({ baseline: r.baseline, count: r.events.length, events: r.events });
    }
  );

  server.registerPrompt(
    "whats_new",
    { description: "Check for new school activity and brief the student on it" },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Call the check_new_events tool.",
              "If baseline is true, say you've saved a baseline and will report changes from now on, then call list_upcoming_work and give a quick view of the week instead.",
              "Otherwise, brief me conversationally on each event, leading with what matters most (grades on big assignments, new tests, due-date changes).",
              "Flag anything that changes what I should work on today.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "plan_my_week",
    { description: "Rank this week's work and lay out a day-by-day plan" },
    () => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              "Call list_upcoming_work with days=7, and list_announcements with days=7 for context.",
              "Rank everything I need to do. Use the priority field as a hint, but override it with judgment — multi-day essays and test prep need to start well before their due date, short worksheets don't.",
              "Then produce:",
              "1. A ranked list with a one-line reason per item.",
              "2. A realistic day-by-day plan that spreads the work out ahead of each deadline.",
              "3. Call out any conflicts or overloaded days.",
              "4. Note anything already submitted that I can ignore.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  server.registerPrompt(
    "study_plan",
    {
      description: "Build a day-by-day study plan for an upcoming test or big assignment",
      argsSchema: {
        course: z.string().describe("Course name or id"),
        assignment: z.string().optional().describe("Test/assignment name or id (optional — defaults to the next test in the course)"),
      },
    },
    ({ course, assignment }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: [
              `I need a study plan for ${assignment ? `"${assignment}"` : "the next upcoming test"} in ${course}.`,
              "Call list_upcoming_work to find the matching assignment (match loosely by name if I gave a name), then get_assignment_details to read its description and topics.",
              "Produce a day-by-day study plan from today until the due date:",
              "- what to review each day, structured around the topics in the description when it lists them",
              "- active-recall practice for each session (self-quizzing, practice problems, explaining from memory), not just rereading",
              "- sessions of 25–45 minutes, and a lighter final review the day before",
              "If other work is due in the same stretch, account for it so the plan stays realistic.",
            ].join("\n"),
          },
        },
      ],
    })
  );

  return server;
}

export async function runMcpServer(provider: SchoolProvider, store: StateStore): Promise<void> {
  const server = createMcpServer(provider, store);
  await server.connect(new StdioServerTransport());
}
