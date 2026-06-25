import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { invokeKimiText, invokeKimiWebSearch } from "../lib/kimi.js";
import { prisma } from "../lib/prisma.js";
import { analyzeIntentWithKimi } from "../services/analyzeIntent.js";
import { getCreditPack } from "../config/creditPacks.js";
import { createWechatNativeOrder, generateOutTradeNo, getWechatMerchantConfig, queryWechatOrder as wechatQueryOrder } from "../lib/wechatPay.js";
import { markWechatOrderPaid } from "../services/wechatOrders.js";
import { buildPreferenceMetadata, getVapidPublicKey as getConfiguredVapidPublicKey } from "../lib/webPush.js";

export const functionsRouter = Router();

functionsRouter.use(requireAuth);

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function normalizeDateString(value, fallbackDate) {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  if (value) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) {
      return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
    }
  }

  return fallbackDate;
}

function getWeekDates(startDate) {
  const base = new Date(`${startDate}T00:00:00+08:00`);
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(base);
    current.setDate(base.getDate() + index);
    return `${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`;
  });
}

function getMonthWeekStarts(startDate) {
  const base = new Date(`${startDate}T00:00:00+08:00`);
  const starts = [];
  for (let week = 0; week < 4; week += 1) {
    const current = new Date(base);
    current.setDate(base.getDate() + (week * 7));
    starts.push(`${current.getFullYear()}-${pad2(current.getMonth() + 1)}-${pad2(current.getDate())}`);
  }
  return starts;
}

function normalizeWeekEvent(event, weekDates) {
  if (!isPlainObject(event) || !event.title) return null;

  const normalizedDate = normalizeDateString(
    event.date,
    typeof event.day_index === "number" ? weekDates[Math.max(0, Math.min(6, event.day_index))] : weekDates[0]
  );
  const dayIndex = Math.max(0, weekDates.indexOf(normalizedDate));

  return {
    date: normalizedDate,
    day_index: dayIndex >= 0 ? dayIndex : 0,
    title: String(event.title).slice(0, 120),
    time: typeof event.time === "string" && /^\d{2}:\d{2}$/.test(event.time) ? event.time : "09:00",
    end_time: typeof event.end_time === "string" && /^\d{2}:\d{2}$/.test(event.end_time) ? event.end_time : undefined,
    is_all_day: Boolean(event.is_all_day),
    type: ["work", "meeting", "travel", "focus", "rest", "other"].includes(event.type) ? event.type : "other",
    icon: typeof event.icon === "string" && event.icon.trim() ? event.icon.trim().slice(0, 4) : "📅",
    description: typeof event.description === "string" ? event.description.slice(0, 240) : undefined
  };
}

function normalizeWeekPlan(rawPlan, startDate, existingPlan) {
  const weekDates = getWeekDates(startDate);
  const base = isPlainObject(rawPlan) ? rawPlan : {};
  const existing = isPlainObject(existingPlan) ? existingPlan : {};
  const eventsSource = Array.isArray(base.events) && base.events.length > 0
    ? base.events
    : (Array.isArray(existing.events) ? existing.events : []);
  const automationsSource = Array.isArray(base.automations) && base.automations.length > 0
    ? base.automations
    : (Array.isArray(existing.automations) ? existing.automations : []);

  return {
    plan_start_date: normalizeDateString(base.plan_start_date, startDate),
    summary: String(base.summary || existing.summary || "本周围绕核心目标推进，兼顾专注、协作与恢复。").slice(0, 300),
    theme: String(base.theme || existing.theme || "本周聚焦").slice(0, 80),
    events: eventsSource.map((item) => normalizeWeekEvent(item, weekDates)).filter(Boolean),
    device_strategies: isPlainObject(base.device_strategies)
      ? base.device_strategies
      : (isPlainObject(existing.device_strategies) ? existing.device_strategies : {
        phone: "工作时段开启专注模式，集中处理即时沟通。",
        watch: "在会议、通勤和健康提醒场景提供轻量提示。",
        pc: "深度工作块优先处理核心任务，减少切换。"
      }),
    automations: automationsSource.map((item) => ({
      title: String(item?.title || "自动化提醒").slice(0, 100),
      description: String(item?.description || "根据周计划自动提醒与整理重点事项。").slice(0, 240),
      icon: typeof item?.icon === "string" && item.icon.trim() ? item.icon.trim().slice(0, 4) : "⚙️",
      status: item?.status === "active" ? "active" : "pending"
    })),
    stats: {
      focus_hours: Number(base?.stats?.focus_hours ?? existing?.stats?.focus_hours ?? 12),
      meetings: Number(base?.stats?.meetings ?? existing?.stats?.meetings ?? 2),
      travel_days: Number(base?.stats?.travel_days ?? existing?.stats?.travel_days ?? 0)
    }
  };
}

function buildWeekFallbackPlan(input, startDate, existingPlan) {
  const weekDates = getWeekDates(startDate);
  const keywords = String(input || "");
  const events = [];

  if (/出差|飞|机场|高铁|酒店/.test(keywords)) {
    events.push({ date: weekDates[1], day_index: 1, title: "差旅与行程确认", time: "09:00", type: "travel", icon: "✈️" });
  }
  if (/会议|汇报|沟通|对接|拜访/.test(keywords)) {
    events.push({ date: weekDates[2], day_index: 2, title: "关键会议与沟通", time: "14:00", type: "meeting", icon: "👥" });
  }
  if (/跑步|健身|锻炼|体检|休息|作息/.test(keywords)) {
    events.push({ date: weekDates[4], day_index: 4, title: "健康与恢复安排", time: "18:30", type: "rest", icon: "💪" });
  }
  if (/发布|上线|研发|开发|复盘|学习|阅读|备考/.test(keywords) || events.length === 0) {
    events.unshift({ date: weekDates[0], day_index: 0, title: "深度专注推进核心事项", time: "09:30", type: "focus", icon: "🎯" });
    events.push({ date: weekDates[3], day_index: 3, title: "中段检查与调整", time: "16:00", type: "work", icon: "🧭" });
  }

  return normalizeWeekPlan({
    plan_start_date: startDate,
    summary: `已根据输入生成基础周计划：${String(input || "").slice(0, 40) || "围绕本周重点推进核心安排"}。`,
    theme: /出差|会议/.test(keywords) ? "协同推进周" : "专注推进周",
    events,
    automations: [
      { title: "每日重点回顾", description: "每天晚上回顾当日推进情况并整理明日重点。", icon: "✨", status: "active" }
    ],
    stats: {
      focus_hours: events.filter((item) => item.type === "focus" || item.type === "work").length * 3,
      meetings: events.filter((item) => item.type === "meeting").length,
      travel_days: events.filter((item) => item.type === "travel").length
    }
  }, startDate, existingPlan);
}

function normalizeMonthlyPlan(rawPlan, startDate, existingPlan) {
  const base = isPlainObject(rawPlan) ? rawPlan : {};
  const existing = isPlainObject(existingPlan) ? existingPlan : {};
  const milestonesSource = Array.isArray(base.key_milestones) && base.key_milestones.length > 0
    ? base.key_milestones
    : (Array.isArray(existing.key_milestones) ? existing.key_milestones : []);
  const weeksSource = Array.isArray(base.weeks_breakdown) && base.weeks_breakdown.length > 0
    ? base.weeks_breakdown
    : (Array.isArray(existing.weeks_breakdown) ? existing.weeks_breakdown : []);

  return {
    plan_start_date: normalizeDateString(base.plan_start_date, startDate),
    summary: String(base.summary || existing.summary || "本月以关键目标拆解、节奏推进和阶段复盘为主。").slice(0, 400),
    theme: String(base.theme || existing.theme || "月度蓝图").slice(0, 80),
    key_milestones: milestonesSource.map((item, index) => ({
      title: String(item?.title || `里程碑 ${index + 1}`).slice(0, 120),
      deadline: normalizeDateString(item?.deadline, startDate),
      type: String(item?.type || "milestone").slice(0, 40)
    })),
    weeks_breakdown: weeksSource.map((item, index) => ({
      week_label: String(item?.week_label || `第 ${index + 1} 周`).slice(0, 40),
      focus: String(item?.focus || "推进当周重点").slice(0, 120),
      key_events: Array.isArray(item?.key_events) ? item.key_events.slice(0, 6).map((entry) => String(entry).slice(0, 120)) : []
    })),
    strategies: isPlainObject(base.strategies)
      ? base.strategies
      : (isPlainObject(existing.strategies) ? existing.strategies : {
        focus: "前中后段分别对应启动、推进、收口。",
        balance: "每周保留恢复和复盘窗口，避免全月透支。"
      }),
    stats: {
      focus_hours: Number(base?.stats?.focus_hours ?? existing?.stats?.focus_hours ?? 36),
      milestones_count: Number(base?.stats?.milestones_count ?? existing?.stats?.milestones_count ?? milestonesSource.length ?? 3)
    }
  };
}

function buildMonthFallbackPlan(input, startDate, existingPlan) {
  const weekStarts = getMonthWeekStarts(startDate);
  const keywords = String(input || "");
  const milestones = [
    { title: "明确月度目标与优先级", deadline: weekStarts[0], type: "goal" },
    { title: "完成核心事项中段检查", deadline: weekStarts[2], type: "review" },
    { title: "月底总结与复盘", deadline: weekStarts[3], type: "review" }
  ];

  if (/上线|发布|交付/.test(keywords)) {
    milestones.unshift({ title: "完成发布前准备", deadline: weekStarts[1], type: "launch" });
  }
  if (/考试|学习|读书|训练/.test(keywords)) {
    milestones.push({ title: "完成本月阶段学习成果", deadline: weekStarts[3], type: "milestone" });
  }

  return normalizeMonthlyPlan({
    plan_start_date: startDate,
    summary: `已根据输入生成基础月度蓝图：${String(input || "").slice(0, 50) || "聚焦本月核心目标与节奏安排"}。`,
    theme: /提升|学习|习惯/.test(keywords) ? "成长提升月" : "目标推进月",
    key_milestones: milestones,
    weeks_breakdown: [
      { week_label: "第 1 周", focus: "明确目标与拆解动作", key_events: ["梳理优先级", "建立执行节奏"] },
      { week_label: "第 2 周", focus: "集中推进核心事项", key_events: ["安排深度工作块", "同步关键协作"] },
      { week_label: "第 3 周", focus: "检查进度与修正路径", key_events: ["做一次中期复盘", "补齐风险项"] },
      { week_label: "第 4 周", focus: "收口交付与总结复盘", key_events: ["完成交付", "整理复盘"] }
    ],
    strategies: {
      focus: "把月目标拆到每周，避免一次性压到月底。",
      balance: "在高强度推进之外预留恢复与缓冲空间。"
    },
    stats: {
      focus_hours: 40,
      milestones_count: milestones.length
    }
  }, startDate, existingPlan);
}

async function generateWeekPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, normalizeDateString(payload.currentDate, new Date().toISOString().slice(0, 10)));

  try {
    const data = await invokeKimiText({
      systemPrompt: [
        "你是一名中文周计划规划助手。",
        `当前查看周起始日期（周一）是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        "请返回完整周计划，而不是片段。",
        "events 中每条都要包含：date(YYYY-MM-DD)、day_index(0-6)、title、time(HH:MM)、type、icon。",
        "device_strategies 至少包含 phone/watch/pc 三项。",
        "automations 仅保留 1-4 条最有价值的自动化动作。"
      ].join("\n"),
      prompt: [
        `用户输入：${payload.input || ""}`,
        payload.existingPlan ? `现有周计划（如需追加，请返回合并后的完整版本）：${JSON.stringify(payload.existingPlan)}` : "",
        `今天日期：${payload.currentDate || startDate}`
      ].filter(Boolean).join("\n\n"),
      responseJsonSchema: {
        type: "object",
        properties: {
          plan_start_date: { type: "string" },
          summary: { type: "string" },
          theme: { type: "string" },
          events: { type: "array" },
          device_strategies: { type: "object" },
          automations: { type: "array" },
          stats: { type: "object" }
        },
        required: ["summary", "events"]
      },
      temperature: 0.4
    });

    return normalizeWeekPlan(data, startDate, payload.existingPlan);
  } catch (_error) {
    return buildWeekFallbackPlan(payload.input, startDate, payload.existingPlan);
  }
}

async function generateMonthPlan(payload) {
  const startDate = normalizeDateString(payload.startDate, new Date().toISOString().slice(0, 10));

  try {
    const data = await invokeKimiText({
      systemPrompt: [
        "你是一名中文月度规划助手。",
        `当前查看月份起始日期是：${startDate}。`,
        "输出必须是 JSON，不要输出解释。",
        "请返回完整月度蓝图。",
        "key_milestones 返回 3-6 个关键里程碑。",
        "weeks_breakdown 返回 4-5 周拆解，每周包含 week_label、focus、key_events。"
      ].join("\n"),
      prompt: [
        `用户输入：${payload.input || ""}`,
        Array.isArray(payload.behaviors) && payload.behaviors.length > 0
          ? `近期待观察到的行为样本：${JSON.stringify(payload.behaviors.slice(0, 20))}`
          : "",
        payload.existingPlan ? `现有月计划（如需追加，请返回合并后的完整版本）：${JSON.stringify(payload.existingPlan)}` : ""
      ].filter(Boolean).join("\n\n"),
      responseJsonSchema: {
        type: "object",
        properties: {
          plan_start_date: { type: "string" },
          summary: { type: "string" },
          theme: { type: "string" },
          key_milestones: { type: "array" },
          weeks_breakdown: { type: "array" },
          strategies: { type: "object" },
          stats: { type: "object" }
        },
        required: ["summary", "key_milestones", "weeks_breakdown"]
      },
      temperature: 0.4
    });

    return normalizeMonthlyPlan(data, startDate, payload.existingPlan);
  } catch (_error) {
    return buildMonthFallbackPlan(payload.input, startDate, payload.existingPlan);
  }
}

functionsRouter.post("/:name", async (req, res) => {
  const { name } = req.params;
  const payload = req.body || {};

  try {
    if (name === "invokeKimi") {
      if (Array.isArray(payload.file_urls) && payload.file_urls.length > 0) {
        return res.status(501).json({
          error: "FILE_INPUT_NOT_IMPLEMENTED",
          message: "独立后端当前仅支持纯文本 Kimi 调用，文件上传与附件抽取尚未迁移"
        });
      }

      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: payload.system_prompt,
        responseJsonSchema: payload.response_json_schema,
        model: payload.model,
        temperature: payload.temperature
      });

      return res.json(data);
    }

    if (name === "kimiWebBrowse") {
      const data = await invokeKimiWebSearch({
        query: payload.query,
        language: payload.language
      });

      return res.json(data);
    }

    if (name === "analyzeIntent") {
      const data = await analyzeIntentWithKimi({
        input: payload.input,
        date: payload.date,
        existingPlan: payload.existingPlan
      });

      return res.json(data);
    }

    if (name === "callAI") {
      const data = await invokeKimiText({
        prompt: payload.prompt,
        systemPrompt: payload.system_prompt,
        responseJsonSchema: payload.response_json_schema,
        model: payload.model,
        temperature: payload.temperature
      });

      return res.json({
        data,
        balance: req.user.aiCredits
      });
    }

    if (name === "generateWeekPlan") {
      if (!payload.input || !String(payload.input).trim()) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少周计划输入内容" });
      }

      return res.json(await generateWeekPlan(payload));
    }

    if (name === "generateMonthPlan") {
      if (!payload.input || !String(payload.input).trim()) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少月计划输入内容" });
      }

      return res.json(await generateMonthPlan(payload));
    }

    if (name === "createWechatOrder") {
      const pack = getCreditPack(payload.packId);
      if (!pack) {
        return res.status(400).json({ error: "INVALID_PACK", message: "无效的点数包" });
      }

      const cfg = await getWechatMerchantConfig();
      if (!cfg) {
        return res.status(501).json({ error: "WECHAT_NOT_CONFIGURED", message: "微信支付未配置" });
      }

      const reuseAfterMs = 10 * 60 * 1000;
      const reuseSince = new Date(Date.now() - reuseAfterMs);
      const existing = await prisma.wechatOrder.findFirst({
        where: {
          userId: req.user.id,
          packId: pack.id,
          status: "PENDING",
          createdAt: { gt: reuseSince }
        },
        orderBy: { createdAt: "desc" }
      });

      if (existing?.codeUrl) {
        return res.json({
          data: {
            code_url: existing.codeUrl,
            order_no: existing.orderNo
          }
        });
      }

      const outTradeNo = generateOutTradeNo("wx");
      const description = `SoulSentry · ${pack.name} · ${pack.credits}点`;
      const attach = JSON.stringify({ user_id: req.user.id, pack_id: pack.id, credits: pack.credits });

      const result = await createWechatNativeOrder(
        {
          description,
          outTradeNo,
          totalFen: pack.priceFen,
          attach
        },
        cfg
      );

      const codeUrl = result?.code_url;
      if (!codeUrl) {
        return res.status(502).json({ error: "WECHAT_CREATE_ORDER_FAILED", message: "微信下单失败" });
      }

      await prisma.wechatOrder.create({
        data: {
          userId: req.user.id,
          orderNo: outTradeNo,
          packId: pack.id,
          credits: pack.credits,
          amountFen: pack.priceFen,
          description,
          codeUrl,
          status: "PENDING"
        }
      });

      return res.json({ data: { code_url: codeUrl, order_no: outTradeNo } });
    }

    if (name === "queryWechatOrder") {
      const orderNo = String(payload.order_no || "").trim();
      if (!orderNo) {
        return res.status(400).json({ error: "INVALID_INPUT", message: "缺少订单号" });
      }

      const order = await prisma.wechatOrder.findFirst({
        where: { orderNo, userId: req.user.id }
      });

      if (!order) {
        return res.status(404).json({ error: "NOT_FOUND", message: "订单不存在" });
      }

      if (order.status === "PAID") {
        return res.json({ data: { paid: true, order_no: order.orderNo } });
      }

      const cfg = await getWechatMerchantConfig();
      if (!cfg) {
        return res.json({ data: { paid: false, order_no: order.orderNo } });
      }

      try {
        const remote = await wechatQueryOrder(order.orderNo, cfg);
        const tradeState = remote?.trade_state;
        const transactionId = remote?.transaction_id || null;
        const successTime = remote?.success_time || null;

        if (tradeState === "SUCCESS") {
          await markWechatOrderPaid({
            orderNo: order.orderNo,
            transactionId,
            paidAt: successTime ? new Date(successTime) : null
          });
          return res.json({ data: { paid: true, order_no: order.orderNo } });
        }

        if (tradeState && tradeState !== order.status) {
          await prisma.wechatOrder.update({
            where: { id: order.id },
            data: { status: String(tradeState).slice(0, 40) }
          });
        }
      } catch (_error) {
        void _error;
      }

      return res.json({ data: { paid: false, order_no: order.orderNo } });
    }

    if (name === "getVapidPublicKey") {
      return res.json({
        data: {
          publicKey: getConfiguredVapidPublicKey()
        }
      });
    }

    if (name === "savePushSubscription") {
      const existingPreference = await prisma.userPreference.findUnique({
        where: { userId: req.user.id }
      });

      const nextSubscription = payload.subscription || null;
      const nextMetadata = buildPreferenceMetadata(existingPreference?.metadata, {
        push_subscription: nextSubscription,
        push_user_agent: payload.user_agent ? String(payload.user_agent).slice(0, 500) : null,
        push_enabled: Boolean(nextSubscription)
      });

      const preference = await prisma.userPreference.upsert({
        where: { userId: req.user.id },
        update: {
          pushNotifications: Boolean(nextSubscription),
          metadata: nextMetadata
        },
        create: {
          userId: req.user.id,
          pushNotifications: Boolean(nextSubscription),
          locale: "zh-CN",
          timezone: "Asia/Shanghai",
          metadata: nextMetadata
        }
      });

      return res.json({
        data: {
          ok: true,
          subscribed: Boolean(nextSubscription),
          preference_id: preference.id
        }
      });
    }

    if (["executeAutomation", "createStripeCheckout"].includes(name)) {
      return res.status(501).json({
        error: "FUNCTION_NOT_IMPLEMENTED",
        message: `独立后端已预留 ${name}，但尚未完成迁移`,
        input: payload
      });
    }

    return res.status(404).json({
      error: "FUNCTION_NOT_FOUND",
      message: `未找到函数 ${name}`
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      error: "FUNCTION_EXECUTION_FAILED",
      message: error.message || "函数执行失败"
    });
  }
});
