import { invokeKimiText } from "../lib/kimi.js";

const DEVICE_IDS = ["phone", "watch", "glasses", "car", "home", "pc"];

function buildEmptyDevices() {
  return {
    phone: { name: "手机", strategies: [] },
    watch: { name: "手表", strategies: [] },
    glasses: { name: "眼镜", strategies: [] },
    car: { name: "汽车", strategies: [] },
    home: { name: "家居", strategies: [] },
    pc: { name: "工作站", strategies: [] }
  };
}

function normalizeAnalyzeIntentResult(result, fallbackDate) {
  const devices = buildEmptyDevices();

  if (result?.devices && typeof result.devices === "object") {
    Object.entries(result.devices).forEach(([key, value]) => {
      if (!devices[key]) return;
      devices[key] = {
        name: value?.name || devices[key].name,
        strategies: Array.isArray(value?.strategies) ? value.strategies : []
      };
    });
  }

  return {
    steps: Array.isArray(result?.steps) ? result.steps : [],
    resolved_date: result?.resolved_date || fallbackDate,
    timeline: Array.isArray(result?.timeline) ? result.timeline : [],
    devices,
    automations: Array.isArray(result?.automations) ? result.automations : [],
    parsed: result?.parsed && typeof result.parsed === "object" ? result.parsed : {}
  };
}

export async function analyzeIntentWithKimi({
  input,
  date,
  existingPlan
}) {
  const fallbackDate = date || new Date().toISOString().slice(0, 10);
  const emptyResult = normalizeAnalyzeIntentResult({}, fallbackDate);

  if (!input?.trim()) {
    return emptyResult;
  }

  const schema = {
    type: "object",
    properties: {
      steps: {
        type: "array",
        items: {
          type: "object",
          properties: {
            key: { type: "string" },
            text: { type: "string" },
            icon: { type: "string" }
          },
          required: ["key", "text"]
        }
      },
      resolved_date: { type: "string" },
      timeline: {
        type: "array",
        items: {
          type: "object",
          properties: {
            time: { type: "string" },
            date: { type: "string" },
            title: { type: "string" },
            description: { type: "string" },
            type: { type: "string" }
          },
          required: ["time", "date", "title"]
        }
      },
      devices: {
        type: "object",
        properties: {
          phone: { type: "object" },
          watch: { type: "object" },
          glasses: { type: "object" },
          car: { type: "object" },
          home: { type: "object" },
          pc: { type: "object" }
        }
      },
      automations: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            desc: { type: "string" },
            status: { type: "string" },
            device_id: { type: "string" }
          },
          required: ["title", "desc", "status"]
        }
      },
      parsed: {
        type: "object",
        properties: {
          times: { type: "array", items: { type: "string" } },
          intents: { type: "array", items: { type: "string" } },
          locations: { type: "array", items: { type: "string" } }
        }
      }
    },
    required: ["resolved_date", "timeline", "devices", "automations", "parsed"]
  };

  const existingPlanContext = existingPlan
    ? `\n已有规划上下文：${JSON.stringify(existingPlan)}`
    : "";

  const systemPrompt = `你是 SoulSentry 的智能日程分析器，需要把中文自然语言输入转成结构化的时间线、设备协同策略和自动化建议。

输出要求：
1. 严格返回 JSON。
2. timeline 中每项包含 time/date/title，date 使用 YYYY-MM-DD。
3. devices 必须是对象，且只允许包含 ${DEVICE_IDS.join(", ")} 这些 key。
4. 每个设备项包含 name 和 strategies；strategies 是数组，每项包含 time/method/content/priority。
5. automations 是可执行建议，status 只能是 active/ready/monitoring/pending。
6. 如果用户输入缺少明确日期，resolved_date 默认使用 ${fallbackDate}。
7. steps 用中文给出 3 到 5 个简短分析步骤。`;

  const prompt = `用户输入：${input}
当前视图日期：${fallbackDate}${existingPlanContext}

请根据输入给出：
- timeline：关键时间安排
- devices：按设备拆分的提醒或协同建议
- automations：建议触发的自动动作
- parsed：提取到的时间、意图、地点`;

  const result = await invokeKimiText({
    prompt,
    systemPrompt,
    responseJsonSchema: schema,
    temperature: 0.2
  });

  return normalizeAnalyzeIntentResult(result, fallbackDate);
}
