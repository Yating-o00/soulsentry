import { base44 } from "@/api/base44Client";

// 统一输入口的意图路由：weave（任务编织）/ day_plan（日程规划）/ hub（设备协同）
// 先用启发式规则命中，命中不了才调一次轻量 LLM，尽量少消耗点数。

export const CAPTURE_KINDS = {
  weave: { label: "任务编织", hint: "已编织进你的任务链" },
  day_plan: { label: "日程规划", hint: "已交给智能日程规划" },
  hub: { label: "设备协同", hint: "已交给心栈中枢" },
};

const DEVICE_RE = /(设备|手表|眼镜|汽车|开车|车上|智能家居|工作站|多端|全设备|出差|航班|飞机|飞[京沪深广]|机场|高铁|路上|导航|通勤)/;
const PLAN_RE = /(日程|安排|规划|计划|行程|全天|一整天|上午.*下午|今天.*然后|先.*再.*最后)/;

function countTimePoints(text) {
  const matches = text.match(/(\d{1,2}[:：]\d{2}|\d{1,2}\s*点|上午|中午|下午|傍晚|晚上|早上)/g);
  return matches ? matches.length : 0;
}

function heuristicRoute(text) {
  if (DEVICE_RE.test(text)) return "hub";
  if (PLAN_RE.test(text)) return "day_plan";
  if (countTimePoints(text) >= 2) return "day_plan";
  if (text.length <= 24 && countTimePoints(text) <= 1) return "weave";
  return null;
}

export async function routeCaptureIntent(text) {
  const input = String(text || "").trim();
  if (!input) return "weave";

  const quick = heuristicRoute(input);
  if (quick) return quick;

  try {
    const res = await base44.integrations.Core.InvokeLLM({
      prompt: `判断这句用户输入应该交给哪个处理器，只返回类别：
- weave：单个碎片念头 / 一件待办 / 一句想法
- day_plan：一天或多天的多项安排、时间表、需要排日程
- hub：跨设备、出行、需要多端协同提醒的复杂意图

用户输入：""" ${input} """`,
      response_json_schema: {
        type: "object",
        properties: { kind: { type: "string", enum: ["weave", "day_plan", "hub"] } },
        required: ["kind"],
      },
    });
    const kind = res?.kind;
    if (kind === "day_plan" || kind === "hub" || kind === "weave") return kind;
  } catch (e) {
    console.warn("[captureRouter] LLM route failed, fallback weave", e?.message);
  }
  return "weave";
}