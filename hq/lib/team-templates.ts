// Ready-made teams a new user can start from, then shape to their needs.

import { newId, type Team, type TeamAgent } from "./teams";

export interface TeamTemplate {
  id: string;
  name: string;
  emoji: string;
  pitch: string;
  build: () => Omit<Team, "id" | "createdAt" | "updatedAt" | "deployments">;
}

const agent = (a: Omit<TeamAgent, "id" | "placements"> & { placements?: TeamAgent["placements"] }): TeamAgent => ({
  id: newId("agent"),
  placements: [],
  ...a,
});

const reviewers = (): TeamAgent[] => [
  agent({
    name: "Spec checker",
    role: "spec",
    mission: "Checks the PR does what the issue asks, no more, no less.",
    perimeter: [],
    attention: ["Every acceptance criterion must be covered by the diff or by a test."],
    context: "",
    skills: [],
    guardrails: [],
  }),
  agent({
    name: "Security guard",
    role: "securite",
    mission: "Looks for secrets, injections and unsafe dependencies.",
    perimeter: [],
    attention: ["Block any secret, token or personal data written in the code."],
    context: "",
    skills: [],
    guardrails: [
      {
        name: "no-secrets.md",
        content:
          "# No secrets\n\n- No API key, token or password in the code, the tests or the fixtures.\n- Environment variables only, documented in `.env.example` with a fake value.\n",
      },
    ],
  }),
  agent({
    name: "Test keeper",
    role: "tests",
    mission: "Makes sure each change comes with tests that would fail without it.",
    perimeter: [],
    attention: ["A bug fix comes with a test that reproduces the bug."],
    context: "",
    skills: [],
    guardrails: [],
  }),
];

const SMALL_DIFFS = {
  name: "small-diffs.md",
  content:
    "# Small diffs\n\n- Change only what the issue asks.\n- No drive-by refactoring, no reformatting of untouched files.\n- No new dependency without saying why in the PR description.\n",
};

export const TEAM_TEMPLATES: TeamTemplate[] = [
  {
    id: "web-app",
    name: "Web app squad",
    emoji: "🚀",
    pitch: "A front-end dev, an API dev and the three reviewers. For a product with a UI and a backend.",
    build: () => ({
      name: "Web app squad",
      description: "Ships features end to end on a web app.",
      context: "Describe your product here: who uses it, what matters most to them, and the tone of the interface.",
      template: "web-app",
      agents: [
        agent({
          name: "Pixel",
          role: "dev",
          mission: "Builds the interface: pages, components, styles.",
          perimeter: ["src/app/**", "src/components/**", "src/styles/**"],
          attention: ["Every screen works at 390 px wide.", "Reuse existing components before creating new ones."],
          context: "",
          skills: [
            {
              name: "ui-conventions.md",
              content:
                "# UI conventions\n\n- Components in `src/components`, one file per component.\n- Accessible by default: labels on inputs, alt on images, focus visible.\n- Text visible to users is short and plain.\n",
            },
          ],
          guardrails: [SMALL_DIFFS],
        }),
        agent({
          name: "Bolt",
          role: "dev",
          mission: "Builds the API, the data model and the migrations.",
          perimeter: ["src/server/**", "src/db/**", "migrations/**"],
          attention: ["A migration is never edited once merged: write a new one.", "Validate every input at the API boundary."],
          context: "",
          skills: [
            {
              name: "api-conventions.md",
              content: "# API conventions\n\n- JSON in and out, errors as `{ error: string }` with the right status code.\n- Pagination with `?cursor=`.\n",
            },
          ],
          guardrails: [SMALL_DIFFS],
        }),
        ...reviewers(),
      ],
    }),
  },
  {
    id: "content-site",
    name: "Content site",
    emoji: "📰",
    pitch: "One dev who knows SEO and accessibility, and the reviewers. For a showcase site or a blog.",
    build: () => ({
      name: "Content site crew",
      description: "Keeps a content site fast, accessible and well referenced.",
      context: "Describe the site: audience, languages, the pages that matter most.",
      template: "content-site",
      agents: [
        agent({
          name: "Quill",
          role: "dev",
          mission: "Edits pages and components with care for SEO and accessibility.",
          perimeter: ["src/**", "public/**", "content/**"],
          attention: ["Each page has a unique title and meta description.", "Images have width, height and alt."],
          context: "",
          skills: [
            {
              name: "seo-checklist.md",
              content: "# SEO checklist\n\n- One h1 per page.\n- Canonical URL set.\n- Links have meaningful text, never \"click here\".\n",
            },
          ],
          guardrails: [
            SMALL_DIFFS,
            { name: "no-tracking.md", content: "# No tracking\n\nNever add an analytics or advertising script without an explicit request in the issue.\n" },
          ],
        }),
        ...reviewers(),
      ],
    }),
  },
  {
    id: "solo",
    name: "Solo builder",
    emoji: "🧑‍🚀",
    pitch: "One general dev and a security reviewer. The lightest setup, to start small.",
    build: () => ({
      name: "Solo crew",
      description: "One versatile dev agent, one guard.",
      context: "",
      template: "solo",
      agents: [
        agent({
          name: "Nova",
          role: "dev",
          mission: "Does a bit of everything, carefully.",
          perimeter: ["**"],
          attention: ["Ask through needs-human rather than guess when the issue is unclear."],
          context: "",
          skills: [],
          guardrails: [SMALL_DIFFS],
        }),
        reviewers()[1],
      ],
    }),
  },
];

export function teamFromTemplate(templateId: string | null, name?: string): Team {
  const now = new Date().toISOString();
  const tpl = TEAM_TEMPLATES.find((t) => t.id === templateId);
  const base = tpl
    ? tpl.build()
    : { name: "My team", description: "", context: "", template: null, agents: [] as TeamAgent[] };
  return { ...base, name: name?.trim() || base.name, id: newId("team"), createdAt: now, updatedAt: now, deployments: [] };
}
