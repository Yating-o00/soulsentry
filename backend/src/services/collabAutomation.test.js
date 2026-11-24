import test from "node:test";
import assert from "node:assert/strict";
import { normalizeAgentSettings, renderWelcomeText, buildCheckinDigest } from "./collabAutomation.js";

test("normalizes automation settings with safe defaults", () => {
  const settings = normalizeAgentSettings({
    settings: {
      language: "en",
      welcome: { enabled: true, template: "Hi {name}" },
      checkinDigest: { enabled: true, time: "21:00", mentionMissing: false, lastDate: "2026-11-24" },
    },
  });
  assert.equal(settings.language, "en");
  assert.equal(settings.welcome.enabled, true);
  assert.equal(settings.checkinDigest.lastDate, "2026-11-24");
  const fallback = normalizeAgentSettings({});
  assert.equal(fallback.language, "auto");
  assert.equal(fallback.welcome.enabled, false);
  assert.equal(fallback.checkinDigest.time, "21:00");
});

test("renders a localized welcome and guarantees a mention", () => {
  const task = {
    title: "产品上新",
    user: { displayName: "小林" },
    members: [{ user: { displayName: "阿花" } }],
    metadata: { collab: { goal: "一周完成上线" } },
  };
  const member = { displayName: "阿花" };
  const custom = renderWelcomeText({
    task,
    member,
    settings: normalizeAgentSettings({ settings: { language: "zh", welcome: { enabled: true, template: "欢迎 {name} 加入 {task}，目标：{goal}" } } }),
  });
  assert.match(custom, /@阿花/);
  assert.match(custom, /产品上新/);
  assert.match(custom, /一周完成上线/);

  const english = renderWelcomeText({
    task,
    member,
    settings: normalizeAgentSettings({ settings: { language: "en", welcome: { enabled: true, template: "" } } }),
  });
  assert.match(english, /Welcome @阿花/);
  assert.match(english, /product|产品上新/i);
});

test("builds a check-in digest with done/missing members and language", () => {
  const task = { title: "晨读", metadata: { collab: { goal: "每天晨读" } } };
  const members = [
    { userId: "u1", name: "小林" },
    { userId: "u2", name: "阿花" },
    { userId: "u3", name: "小周" },
  ];
  const digest = buildCheckinDigest({
    task,
    members,
    checkins: [
      { userId: "u1", note: "读了 20 分钟", createdAt: new Date("2026-11-24T12:00:00Z") },
      { userId: "u2", photoUrl: "https://example.com/a.jpg", createdAt: new Date("2026-11-24T13:00:00Z") },
    ],
    date: "2026-11-24",
    settings: normalizeAgentSettings({ settings: { language: "zh", checkinDigest: { enabled: true, mentionMissing: true } } }),
  });
  assert.match(digest.content, /2\/3/);
  assert.match(digest.content, /@小周/);
  assert.deepEqual(digest.mentions, ["u3"]);
  assert.match(digest.content, /阿花/);

  const english = buildCheckinDigest({
    task,
    members,
    checkins: [{ userId: "u1", note: "read", createdAt: new Date() }],
    date: "2026-11-24",
    settings: normalizeAgentSettings({ settings: { language: "en", checkinDigest: { enabled: true, mentionMissing: false } } }),
  });
  assert.match(english.content, /Daily check-in summary/);
  assert.doesNotMatch(english.content, /@/);
});
