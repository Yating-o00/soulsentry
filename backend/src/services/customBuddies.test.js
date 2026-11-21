import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCustomBuddyPrompt,
  buildFallbackCustomBuddy,
  getCustomBuddy,
  sanitizeCustomBuddy,
} from "./customBuddies.js";

test("自定义搭子默认带「资料」板块，便于上传专属资料", () => {
  const buddy = sanitizeCustomBuddy({ name: "摄影" }, { description: "一个摄影搭子" });
  assert.deepEqual(buddy.sections, ["今天", "协同", "资料", "画像"]);
});

test("AI 不可用时的兜底名称从描述里提取领域词", () => {
  assert.equal(
    buildFallbackCustomBuddy("我想要一个每天提醒我喝水的健康搭子，不催我").name,
    "喝水搭子"
  );
  assert.equal(
    buildFallbackCustomBuddy("我想要一个摄影搭子，每周拍一个主题").name,
    "摄影搭子"
  );
});

test("只读取属于当前账号的自定义搭子配置", () => {
  const extra = {
    custom_buddies: {
      custom_1: { id: "custom_1", name: "摄影搭子" },
    },
  };
  assert.equal(getCustomBuddy(extra, "custom_1")?.name, "摄影搭子");
  assert.equal(getCustomBuddy(extra, "study"), null);
});

test("自定义搭子保留专业能力，厨房兜底也按领域设计", () => {
  const buddy = sanitizeCustomBuddy({
    name: "厨房搭子",
    abilities: ["按健康目标规划一周菜单", "根据现有食材给菜谱", "分步骤教做菜"],
  });
  assert.equal(buddy.abilities.length, 3);

  const kitchen = buildFallbackCustomBuddy("我想要一个厨房搭子，教我用手头食材做菜");
  assert.equal(kitchen.name, "厨房搭子");
  assert.ok(kitchen.abilities.some((item) => item.includes("菜单")));
  assert.ok(kitchen.quickAsks.some((item) => item.includes("冰箱")));
});

test("设计提示词要求领域能力，并吸收上传的参考资料", () => {
  const built = buildCustomBuddyPrompt({
    description: "厨房搭子，帮我规划健康饮食并教我做法",
    materialContext: "【我的菜谱笔记】少油少盐，先备菜再开火",
  });
  assert.match(built.prompt, /"abilities"/);
  assert.match(built.prompt, /真实工作流/);
  assert.match(built.prompt, /我的菜谱笔记/);
  assert.match(built.systemPrompt, /不要套用/);
});
