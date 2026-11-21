import test from "node:test";
import assert from "node:assert/strict";
import {
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
