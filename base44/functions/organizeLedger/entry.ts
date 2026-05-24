import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 整理账本 - 心栈 SoulSentry
 *
 * 输入：用户混乱的记账文本（语音转写、聊天碎片、银行流水、随手记账）+ 可选附件文本
 * 输出：结构化账目 + 分类汇总 + 周期账单识别 + 简短洞察
 *
 * 由 executeAutomation 在 phase=execute 时调用。
 */

const SCHEMA = {
  type: "object",
  properties: {
    entries: {
      type: "array",
      description: "识别出的所有账目记录，按真实发生时间从近到远排序",
      items: {
        type: "object",
        properties: {
          date: { type: "string", description: "日期，统一格式 MM月DD日；今天/昨天等相对词请基于今日反推" },
          item: { type: "string", description: "事项名称（去掉日期/金额/支付方式等噪声），不超过 20 字" },
          amount: { type: "number", description: "金额（正数，单位元）" },
          type: { type: "string", enum: ["income", "expense", "transfer"], description: "支出/收入/转账（借出借入）" },
          category: {
            type: "string",
            enum: ["餐饮", "交通", "购物", "居住", "娱乐", "医疗", "转账", "工资", "理财", "教育", "宠物", "其他"]
          },
          tags: {
            type: "array",
            items: { type: "string" },
            description: "可选标签，如：外卖、咖啡、通勤、聚餐、网购、AA等"
          },
          raw: { type: "string", description: "对应的原始文本片段，用于审计" }
        },
        required: ["date", "item", "amount", "type", "category"]
      }
    },
    stats: {
      type: "object",
      properties: {
        total_income: { type: "number" },
        total_expense: { type: "number" },
        by_category: {
          type: "object",
          description: "按分类汇总 { 分类名: { income, expense, count } }",
          additionalProperties: {
            type: "object",
            properties: {
              income: { type: "number" },
              expense: { type: "number" },
              count: { type: "number" }
            }
          }
        },
        recurring: {
          type: "array",
          description: "识别出的周期账单（房租/会员/话费/水电等）",
          items: {
            type: "object",
            properties: {
              item: { type: "string" },
              amount: { type: "number" },
              cycle: { type: "string", description: "如 月/季/年" }
            }
          }
        },
        alerts: {
          type: "array",
          items: { type: "string" },
          description: "1~4 条简短洞察，如：大额支出占比/咖啡支出占餐饮/疑似重复"
        }
      },
      required: ["total_income", "total_expense"]
    }
  },
  required: ["entries", "stats"]
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { user_text = '', file_block = '' } = await req.json();
    if (!user_text && !file_block) {
      return Response.json({ error: 'user_text or file_block is required' }, { status: 400 });
    }

    const todayCN = new Date().toLocaleDateString('zh-CN', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
    });

    const prompt = `今日：${todayCN}。请把以下混乱的记账内容（可能是微信语音转写、聊天碎片、银行流水或随手记账）重建为结构化账本：

${user_text}${file_block ? `\n\n附件内容：\n${file_block}` : ''}

要求：
1. 哪怕没有标点符号也要识别出每一笔（如"早饭十二地铁四块咖啡九块九"应识别为 3 笔）。
2. "今天/昨天/前天/X月X日"等相对词必须基于今日反推成 MM月DD日。
3. 金额可能写作 12 / 12块 / 12元 / ¥12 / ￥12 / 十二，统一抽成数字（元）。
4. 中文数字（一二三四五六七八九十）也要识别（如"十二"=12，"一百八十六"=186）。
5. 自动归类到 12 个分类之一；分不清的归"其他"。
6. 收入特征词：工资/奖金/报销/退款/红包/到账/还我；转账特征词：转给/借给/AA/垫付。
7. by_category 必须覆盖 entries 中出现过的所有分类；alerts 给 1~4 条简短洞察（如"咖啡占餐饮XX%"、"大额支出X笔"、"有X笔疑似重复"）。`;

    const sys = "你是金融账目整理专家。你的核心能力是从无序的口语/聊天/流水中精准还原每一笔账目。绝不臆造未出现的金额，宁可漏一笔也不要编造。";

    const kimiRes = await base44.functions.invoke('invokeKimi', {
      prompt,
      response_json_schema: SCHEMA,
      system_prompt: sys,
      temperature: 0.2,
    });

    const data = kimiRes?.data || {};
    if (data?._parse_error || !Array.isArray(data.entries)) {
      return Response.json({
        error: 'LEDGER_PARSE_FAILED',
        message: data?.error || data?._parse_error || 'AI 未识别出账目结构',
      }, { status: 500 });
    }

    return Response.json({
      entries: data.entries,
      stats: data.stats || { total_income: 0, total_expense: 0 },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});