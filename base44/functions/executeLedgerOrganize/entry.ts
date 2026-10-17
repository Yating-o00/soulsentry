import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 整理账本 - 心栈 SoulSentry 自动执行子模块
 *
 * 入参（POST body）：
 *   { user_text: string, file_block?: string }
 *
 * 出参（与 executeAutomation 的 automation_result 结构对齐）：
 *   { type: "ledger_organize", preview, data: { entries, stats, summary }, diff }
 *
 * 抽到独立 function 的原因：executeAutomation 已逼近 2000 行硬上限，必须拆。
 */

// 直连 Moonshot（与 executeAutomation 同款），绕开 base44 平台 quota，
// 避免账本场景因平台限流/wrapper 包装导致 entries 为空、出现"已整理 0 笔账目"假成功
async function callKimi(base44, prompt, response_json_schema, system_prompt) {
  const apiKey = (Deno.env.get("KIMI_API_KEY") || Deno.env.get("MOONSHOT_API_KEY") || "").trim();
  if (!apiKey) throw new Error('KIMI_API_KEY 未配置');
  const wantsJson = !!response_json_schema;
  let sys = system_prompt || "你是个人财务整理助手。";
  if (wantsJson) {
    sys += `\n\n⚠️ 你必须返回一个【符合下方 Schema 的 JSON 实例对象】，而不是返回 Schema 本身。直接输出 schema 中描述的真实字段及其取值，不要包 wrapper（不要塞到 result / data / ledger 这种外层对象里）。\n\nSchema 参考：\n${JSON.stringify(response_json_schema)}`;
  }
  const models = ["kimi-latest", "kimi-k2-0905-preview", "moonshot-v1-auto"];
  let resp = null, lastErr = '', lastStatus = 0;
  for (const m of models) {
    const body = {
      model: m,
      messages: [{ role: "system", content: sys }, { role: "user", content: prompt }],
      temperature: 0.3,
    };
    if (wantsJson) body.response_format = { type: "json_object" };
    try {
      resp = await fetch("https://api.moonshot.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${apiKey}` },
        body: JSON.stringify(body),
      });
      if (resp.ok) break;
      lastErr = await resp.text();
      lastStatus = resp.status;
      if (resp.status !== 404 && resp.status !== 403) break;
    } catch (e) {
      lastErr = e?.message || String(e);
      lastStatus = 0;
    }
  }
  if (!resp || !resp.ok) {
    throw new Error(`Kimi API ${lastStatus}: ${String(lastErr).slice(0, 200)}`);
  }
  const j = await resp.json();
  const content = j.choices?.[0]?.message?.content || "";
  if (wantsJson) {
    try { return JSON.parse(content); } catch {
      const m = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (m) { try { return JSON.parse(m[1]); } catch {} }
      throw new Error(`AI 返回非 JSON，无法解析。原文片段：${String(content).slice(0, 200)}`);
    }
  }
  return { text: content };
}

const LEDGER_SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      description: "识别出的全部账目；按时间从新到旧排序。每条都必须含金额。",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "可读日期，如『5月23日』『2026-05-23』『今天』。无法确定则用今天。" },
          iso_date: { type: "string", description: "ISO 日期 YYYY-MM-DD（用于排序）" },
          item: { type: "string", description: "事项简称，≤18 字，去掉金额和支付平台名" },
          amount: { type: "number", description: "金额（正数）" },
          type: { type: "string", enum: ["income", "expense", "transfer"], description: "收入/支出/转账" },
          category: {
            type: "string",
            enum: ["餐饮", "交通", "购物", "居住", "娱乐", "医疗", "转账", "工资", "理财", "教育", "宠物", "其他"],
            description: "中文分类"
          },
          tags: { type: "array", items: { type: "string" }, description: "标签，如『外卖』『咖啡』『通勤』『网购』『AA』" },
          raw: { type: "string", description: "原始片段（便于追溯）" }
        },
        required: ["item", "amount", "type", "category", "date"]
      }
    },
    stats: {
      type: "object",
      properties: {
        total_income: { type: "number" },
        total_expense: { type: "number" },
        by_category: {
          type: "object",
          description: "按分类聚合：{ 分类: { income, expense, count } }",
          additionalProperties: {
            type: "object",
            properties: {
              income: { type: "number" },
              expense: { type: "number" },
              count: { type: "number" }
            }
          }
        },
        alerts: {
          type: "array",
          items: { type: "string" },
          description: "智能提醒：例如『餐饮占支出 42%,是最大开销』『检测到 2 笔疑似重复记账』"
        },
        recurring: {
          type: "array",
          description: "识别到的周期账单（房租/水电/会员/订阅等）",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              amount: { type: "number" },
              cycle: { type: "string", description: "周期：月/季/年" }
            }
          }
        }
      },
      required: ["total_income", "total_expense"]
    },
    summary: { type: "string", description: "一句话整理结论，≤60 字" }
  },
  required: ["entries", "stats"]
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { user_text = '', file_block = '' } = await req.json();
    if (!user_text.trim() && !file_block.trim()) {
      return Response.json({ error: '缺少账本输入文本' }, { status: 400 });
    }

    const today = new Date();
    const todayISO = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    const todayCN = today.toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });

    const data = await callKimi(
      base44,
      `请把下面这段【混乱的记账文本】整理成结构化账本。

用户原始输入：
${user_text}
${file_block ? `\n附件内容（可能是聊天截图/银行流水/语音转写的补充）：${file_block}` : ''}

参考日期：今天是 ${todayCN}（ISO: ${todayISO}）。

【识别规则】
1) 金额：识别"12 / 9.9 / ¥58 / 一百八十六 / 块/元 / +500 / -200"等所有金额表达，统一为正数 number。中文数字（如"一百八十六"）必须转成阿拉伯数字。
2) 日期：识别"今天/昨天/前天/上周X/5月15日/2026-05-23"等，转成可读 date 字段，并填充 iso_date（YYYY-MM-DD）。无法确定的归到今天。
3) 类型判定：
   - 工资/奖金/报销/退款/红包/收益/到账/收到/归还/+ → income
   - 转给/借给/AA/借款给 → transfer
   - 其余有金额且是花费的 → expense
4) 分类：按语义归到给定的 12 个分类之一（餐饮/交通/购物/居住/娱乐/医疗/转账/工资/理财/教育/宠物/其他）。
5) 事项 item：去掉支付平台（微信/支付宝/扫码/转账）和金额数字，留下"在干什么"，≤18 字。
6) 标签 tags：识别出『外卖』『咖啡』『通勤』『网购』『聚餐』『会员』『打车』『水果』『宠物』等关键标签。
7) 周期账单：房租/水电/物业/宽带/话费/会员/订阅/房贷/保险 → 写入 recurring。
8) alerts：若某分类占支出 > 35%、或出现 ≥ 500 元单笔大额支出、或发现疑似重复记账，则各生成一条对应提醒。
9) summary：一句话总结整理结果，≤60 字。

⚠️ 不要编造文本里没出现的账目。每条 entries 必须能从原始文本找到来源依据，raw 字段填该条来源的原文片段。`,
      LEDGER_SCHEMA,
      "你是个人财务整理助手。能从极度混乱的语音转写/聊天碎片/银行流水中精准提取账目，自动归类、统计、识别周期账单和异常。严格遵循 JSON Schema。"
    );

    // AI 偶尔会把结果包在 wrapper（如 { result: { entries }, data: { entries } }）里，做一层兜底解包
    let payload = data;
    if (!Array.isArray(payload?.entries)) {
      for (const k of ['result', 'data', 'ledger', 'output']) {
        if (Array.isArray(payload?.[k]?.entries)) { payload = payload[k]; break; }
      }
    }

    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    const stats = payload.stats || {};

    // 关键修复：entries 为空时直接抛错，由 executeAutomation 标记 failed,
    // 弹出"重试 / 修改描述"的失败对话框,而不是默默落地"已整理 0 笔"的假成功结果
    if (entries.length === 0) {
      console.warn('[executeLedgerOrganize] empty entries, raw payload:', JSON.stringify(data).slice(0, 500));
      return Response.json({
        error: 'LEDGER_EMPTY',
        message: '未能从你的输入中识别出账目。请确认包含明确的金额（如 12元 / ¥58 / 9.9）和消费描述（如 早饭/咖啡/超市）后再试。',
      }, { status: 500 });
    }

    // 后端兜底：若 AI 漏填 total / by_category，本地重新算
    if (!stats.total_income || !stats.total_expense || !stats.by_category) {
      let inc = 0, exp = 0;
      const byCat = {};
      for (const e of entries) {
        const a = Number(e.amount) || 0;
        const c = e.category || '其他';
        if (!byCat[c]) byCat[c] = { income: 0, expense: 0, count: 0 };
        byCat[c].count += 1;
        if (e.type === 'income') { inc += a; byCat[c].income += a; }
        else if (e.type === 'expense') { exp += a; byCat[c].expense += a; }
      }
      stats.total_income = stats.total_income || inc;
      stats.total_expense = stats.total_expense || exp;
      stats.by_category = stats.by_category || byCat;
    }

    const balance = (stats.total_income || 0) - (stats.total_expense || 0);
    const previewLines = [
      `💰 已整理 ${entries.length} 笔账目`,
      `📊 收入 ¥${Number(stats.total_income || 0).toFixed(0)} · 支出 ¥${Number(stats.total_expense || 0).toFixed(0)} · 结余 ${balance >= 0 ? '+' : ''}¥${balance.toFixed(0)}`,
    ];
    if (data.summary) previewLines.push('', data.summary);
    if (Array.isArray(stats.alerts) && stats.alerts.length) {
      previewLines.push('', '🔔 提醒：');
      stats.alerts.slice(0, 3).forEach(a => previewLines.push(`  · ${a}`));
    }

    return Response.json({
      type: "ledger_organize",
      preview: previewLines.join('\n'),
      data: {
        entries,
        stats,
        summary: data.summary || '',
      },
      diff: [
        {
          action: "create",
          target: `账本整理 · ${entries.length} 笔`,
          detail: `收入 ¥${Number(stats.total_income || 0).toFixed(0)} / 支出 ¥${Number(stats.total_expense || 0).toFixed(0)}`
        }
      ]
    });
  } catch (error) {
    const apiErr = error?.response?.data?.error || error?.response?.data?.message;
    return Response.json({ error: apiErr || error?.message || '未知错误' }, { status: 500 });
  }
});