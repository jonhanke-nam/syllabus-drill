import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { buildIndex } from "../build.mjs";

const html = buildIndex();
const flush = async (n = 5) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

// Fake Claude: answers each quiz request with a one-question quiz titled after the course in the prompt.
function fakeClaude(log, opts = {}) {
  const sample = async () => ({ text: "" });
  sample.json = async (prompt) => {
    log.push(prompt);
    if (opts.hold) await opts.hold;
    if (opts.fail) throw { code: "upstream_error", message: "boom" };
    const heading = prompt.match(/^# (.+?) \(/m)?.[1] ?? "Unknown";
    return { title: "Quiz for " + heading, questions: [
      { type: "mc", topic: "t", source: "s", question: "Q about " + heading, choices: ["a", "b", "c", "d"], answer: 0, explanation: "e" },
    ] };
  };
  return { use: async (name) => (name === "sample" ? sample : null) };
}

let dom, doc, win, prompts;
function load(opts) {
  prompts = [];
  dom = new JSDOM(html, {
    runScripts: "dangerously", pretendToBeVisual: true,
    beforeParse(w) {
      w.claude = fakeClaude(prompts, opts);
      w.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
      w.Element.prototype.scrollIntoView = () => {};
      w.scrollBy = () => {};
    },
  });
  win = dom.window; doc = win.document;
}
const title = () => doc.querySelector(".cover h2")?.textContent;
const courses = () => [...doc.querySelectorAll('input[name="course"]')];
const courseName = (i) => doc.querySelector(`label[for="course-${i}"]`).textContent;
async function pick(i) { const r = courses()[i]; r.checked = true; r.dispatchEvent(new win.Event("change")); await flush(); }
async function generate() { doc.getElementById("go").click(); await flush(); }

beforeEach(() => load());

test("starts on Biology with the example quiz", () => {
  const checked = courses().find((r) => r.checked);
  assert.match(courseName(checked.value), /Biology/);
  assert.ok(doc.querySelector(".example-pill"));
  assert.equal(doc.querySelectorAll(".q").length, 5);
});

test("switching to a course with no quiz clears the old quiz", async () => {
  for (const r of courses()) {
    if (/Biology/.test(courseName(r.value))) continue;
    await pick(Number(r.value));
    assert.equal(doc.querySelector(".cover"), null, "old quiz still showing for " + courseName(r.value));
    assert.equal(doc.querySelector(".working h2").textContent, courseName(r.value));
  }
});

test("every course generates a quiz from its own syllabus", async () => {
  for (let i = 0; i < courses().length; i++) {
    await pick(i);
    await generate();
    const name = courseName(i);
    assert.ok(prompts.at(-1).includes("# " + name), "prompt did not include syllabus for " + name);
    assert.equal(title(), "Quiz for " + name);
  }
});

test("switching back shows each course's own quiz and answers", async () => {
  await pick(0); await generate();
  doc.querySelector(".choice").click(); await flush();
  await pick(1); await generate();
  assert.equal(title(), "Quiz for " + courseName(1));
  await pick(0);
  assert.equal(title(), "Quiz for " + courseName(0));
  assert.ok(doc.querySelector(".choice.is-right"), "answer on course 0 was lost");
  await pick(1);
  assert.equal(doc.querySelector(".choice.is-right"), null);
});

test("the empty-state button writes a quiz", async () => {
  await pick(0);
  doc.getElementById("go-empty").click(); await flush();
  assert.equal(title(), "Quiz for " + courseName(0));
});

test("course picker is locked while a quiz is being written", async () => {
  let release; load({ hold: new Promise((r) => { release = r; }) });
  await pick(0);
  doc.getElementById("go").click(); await flush();
  assert.ok(courses().every((r) => r.disabled));
  release(); await flush();
  assert.ok(courses().every((r) => !r.disabled));
  assert.equal(title(), "Quiz for " + courseName(0));
});

test("a failed generation keeps the course's previous state and shows an error", async () => {
  load({ fail: true });
  await generate();
  assert.ok(doc.querySelector(".example-pill"), "example quiz should still show");
  assert.ok(!doc.getElementById("panel-msg").hidden);
});

test("repairJson fixes LaTeX backslashes in math quizzes", () => {
  const out = win.repairJson('{"q": "eigenvalue \\lambda of A", "r": "line\\n"}');
  assert.equal(out.q, "eigenvalue \\lambda of A");
  assert.equal(out.r, "line\n");
});

test("index.html is up to date with syllabus-drill.html (run npm run build)", () => {
  assert.equal(readFileSync(new URL("../index.html", import.meta.url), "utf8"), html);
});
