import test from "node:test";
import assert from "node:assert/strict";
import { buildCheckinDigest, customRulePeriodKey, fallbackParseCustomRule, isCustomRuleDue, normalizeAgentSettings, normalizeCustomRule, renderWelcomeText } from "./collabAutomation.js";

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

test("compiles natural-language group duties into schedulable rules", () => {
  const daily = fallbackParseCustomRule("每天早上9点提醒大家本周目标", { language: "zh" });
  assert.equal(daily.mode, "schedule");
  assert.equal(daily.frequency, "daily");
  assert.equal(daily.time, "09:00");
  assert.match(daily.instruction, /本周目标/);

  const weekly = fallbackParseCustomRule("每周一晚上8点提醒未打卡成员", { language: "zh" });
  assert.equal(weekly.frequency, "weekly");
  assert.equal(weekly.weekday, 1);
  assert.equal(weekly.time, "20:00");

  const conditional = fallbackParseCustomRule("当有人连续3天没发言时提醒我", { language: "zh" });
  assert.equal(conditional.mode, "schedule");
  assert.equal(conditional.time, "21:00");
  assert.match(conditional.condition, /3天没发言/);

  const instruction = fallbackParseCustomRule("以后尽量用英文跟我沟通", { language: "zh" });
  assert.equal(instruction.mode, "instruction");
});

test("normalizes and checks custom rule periods", () => {
  const rule = normalizeCustomRule({
    id: "r1", name: "每日提醒", mode: "schedule", frequency: "daily",
    time: "21:00", instruction: "提醒大家收尾",
  });
  assert.equal(rule.time, "21:00");
  const at2130 = new Date("2026-11-24T13:30:00.000Z"); // 21:30 Beijing
  assert.equal(isCustomRuleDue(rule, at2130), true);
  assert.equal(customRulePeriodKey(rule, at2130), "2026-11-24");
  assert.equal(isCustomRuleDue({ ...rule, lastRunKey: "2026-11-24" }, at2130), false);
  const at2000 = new Date("2026-11-24T12:00:00.000Z"); // 20:00 Beijing
  assert.equal(isCustomRuleDue(rule, at2000), false);
});
