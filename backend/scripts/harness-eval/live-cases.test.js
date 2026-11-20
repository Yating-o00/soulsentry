import assert from "node:assert/strict";
import test from "node:test";
import { fixtures, gradePlan } from "./live-cases.js";

const byId = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

function row(date, start_time = "10:00", end_time = "10:25") {
  return { date, start_time, end_time, session_type: "session", title: "练习", description: "用纸质词卡练习" };
}

test("sets up ten distinct scenarios with two genuine follow-up turns", () => {
  assert.equal(fixtures.length, 10);
  assert.equal(byId.size, 10);
  assert.equal(fixtures.filter(({ followUp }) => followUp).length, 2);
  assert.equal(fixtures.filter(({ schedule }) => !schedule).length, 1);
});

test("grades each week's frequency and detects a busy period in week two", () => {
  const fixture = byId.get("two_weeks_busy");
  const complete = { children: ["18", "20", "25", "27"].map((day) => row("2026-11-" + day)) };
  assert.deepEqual(gradePlan(complete, fixture).problems, []);
  const broken = { children: [...complete.children.slice(0, 2), row("2026-11-24")] };
  assert.deepEqual(gradePlan(broken, fixture).problems.sort(), ["busy_conflict", "wrong_frequency_week_2"]);
});

test("grades actual elapsed time and allows a slot immediately after a busy period", () => {
  const fixture = byId.get("reading_busy");
  const complete = { children: ["17", "18", "21"].map((day) => row("2026-11-" + day)) };
  assert.deepEqual(gradePlan(complete, fixture).problems, []);
  const adjacentFixture = { ...fixture, busy: [["2026-11-17T09:00:00", "2026-11-17T10:00:00"]] };
  assert.deepEqual(gradePlan(complete, adjacentFixture).problems, []);
  complete.children[0].end_time = "10:24";
  complete.children[0].duration_minutes = 25;
  assert.deepEqual(gradePlan(complete, adjacentFixture).problems, ["wrong_duration"]);
});

test("requires Saturday's adjusted time and the original weekday times", () => {
  const fixture = byId.get("local_saturday_adjustment");
  const adjusted = { children: [
    row("2026-11-16", "10:00", "10:20"),
    row("2026-11-18", "10:00", "10:20"),
    row("2026-11-21", "11:00", "11:20"),
  ] };
  assert.deepEqual(gradePlan(adjusted, fixture, { adjusted: true }).problems, []);
  adjusted.children[0] = row("2026-11-16", "11:00", "11:20");
  assert.deepEqual(gradePlan(adjusted, fixture, { adjusted: true }).problems, ["wrong_start_time"]);
});
