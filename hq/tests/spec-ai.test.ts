import { describe, expect, it } from "vitest";
import { issueBody } from "@/lib/actions";
import { guessScope, viaRules } from "@/lib/spec-ai";

describe("spec without AI", () => {
  it("structures a plain request and asks what is missing", () => {
    const d = viaRules({ prompt: "Export a note as PDF from the note page. The title and date are at the top.", scopes: ["front", "api"], repo: "notula" });
    expect(d.title).toBe("Export a note as PDF from the note page");
    expect(d.criteres).toEqual(["The title and date are at the top"]);
    expect(d.engine).toBe("rules");
    expect(d.questions.length).toBeGreaterThan(0);
  });

  it("guesses the desk from the words used", () => {
    expect(guessScope("Add a button on the settings screen", ["front", "api"])).toBe("front");
    expect(guessScope("Sync contacts through a webhook", ["front", "api"])).toBe("api");
    expect(guessScope("Something vague", ["front", "api"])).toBe("general");
  });

  it("puts a prompted spec inside the issue when there is no spec file", () => {
    const body = issueBody({
      type: "create",
      repo: "o/r",
      title: "t",
      scope: "front",
      spec: "",
      summary: "Users export notes.",
      perimetre: "",
      criteres: "- a",
      horsPerimetre: "",
      verification: "",
      launch: false,
    });
    expect(body).toContain("la spec est dans ce ticket");
    expect(body).toContain("### Spec\n\nUsers export notes.");
  });
});

describe("spec with a local model", () => {
  it("asks Ollama for JSON matching the schema and keeps only known desks", async () => {
    const { vi } = await import("vitest");
    const { draftSpec } = await import("@/lib/spec-ai");
    const calls: { url: string; body?: unknown }[] = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      if (url.endsWith("/api/tags")) return new Response("{}");
      const content = JSON.stringify({
        title: "Export a note as PDF",
        scope: "mobile",
        summary: "Users share notes outside the app.",
        perimetre: "PDF export from the note page.",
        criteres: ["A PDF downloads", "The title is at the top"],
        horsPerimetre: "Folders",
        verification: "Export one note",
        questions: [],
      });
      return new Response(JSON.stringify({ message: { content } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const d = await draftSpec({ prompt: "Export a note as PDF from the note page", scopes: ["front", "api"], repo: "notula" });
    vi.unstubAllGlobals();
    expect(d.engine).toBe("ollama");
    expect(d.scope).toBe("front"); // "mobile" is not a desk: guessed from the words instead
    expect(d.criteres).toHaveLength(2);
    const chat = calls.find((c) => c.url.endsWith("/api/chat"))!.body as { format: { required: string[] }; stream: boolean };
    expect(chat.stream).toBe(false);
    expect(chat.format.required).toContain("criteres");
  });
});
