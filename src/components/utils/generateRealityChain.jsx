import { base44 } from "@/api/base44Client";
import { format } from "date-fns";

/**
 * 生成"完成约定所需的现实事项链路"。
 *
 * ⚠️ 这不是产品内执行流程（创建任务/同步日历/设置提醒），
 *    而是 AI 理解用户约定后，推导出用户要在现实里做的具体事项链路。
 *
 * 示例：
 *   输入："下周和老王吃饭"
 *   输出：
 *     1. 联系老王定时间
 *     2. 选餐厅并订位
 *     3. 出发前确认路线
 *     4. 赴约
 *
 * @param {object} params
 * @param {string} params.title - 约定标题
 * @param {string} [params.originalInput] - 用户原始输入
 * @param {string} [params.category] - promise | task | note | wish
 * @param {string} [params.dueAt] - ISO 时间，如有
 * @returns {Promise<Array<{step_name:string, detail:string, when_hint?:string}> | null>}
 */
export async function generateRealityChain({ title, originalInput, category, dueAt }) {
  if (!title && !originalInput) return null;

  const now = new Date();
  const ctx = `当前时间: ${format(now, "yyyy-MM-dd HH:mm")}`;
  const dueInfo = dueAt ? `\n约定时间: ${dueAt}` : "";

  const result = await base44.integrations.Core.InvokeLLM({
    prompt: `你是一位生活规划顾问。基于用户的一条约定/任务/愿望，推导出用户在现实世界中完成这件事所需的【具体事项链路】。

${ctx}${dueInfo}
约定标题: "${title || ""}"
原始输入: "${originalInput || title || ""}"
类别: ${category || "task"}

【核心要求】：
- 输出的是【用户需要付诸行动的现实事项】，不是系统/产品内部动作
- ❌ 严禁输出："创建任务"、"同步日历"、"设置提醒"、"发送邮件通知"、"加入清单"等产品内动作
- ✅ 应该输出：联系谁、做什么准备、去哪里、确认什么……等真实世界的行动

【示例】
用户："下周和老王吃饭"
→ [
    {"step_name": "联系老王定时间", "detail": "微信确认下周具体哪天方便", "when_hint": "本周内"},
    {"step_name": "选餐厅并订位", "detail": "考虑老王口味选合适餐厅并提前订位", "when_hint": "确认时间后"},
    {"step_name": "出发前确认", "detail": "当天再次确认并规划路线", "when_hint": "赴约当天"},
    {"step_name": "赴约", "detail": "准时到达，享受聚餐", "when_hint": "约定时间"}
  ]

用户："下个月季度汇报"
→ [
    {"step_name": "收集数据素材", "detail": "整理本季度关键指标与项目进展", "when_hint": "汇报前2周"},
    {"step_name": "撰写汇报框架", "detail": "列提纲：成果/问题/下季计划", "when_hint": "汇报前1周"},
    {"step_name": "制作PPT", "detail": "根据框架制作演示文稿", "when_hint": "汇报前5天"},
    {"step_name": "内部彩排", "detail": "找同事试讲收集反馈", "when_hint": "汇报前2天"},
    {"step_name": "正式汇报", "detail": "按计划完成汇报", "when_hint": "汇报当天"}
  ]

用户："我想学钢琴"（愿望类）
→ [
    {"step_name": "明确目标曲目", "detail": "选1-2首想弹的曲子作为里程碑"},
    {"step_name": "找老师或教程", "detail": "报班或选线上课程"},
    {"step_name": "准备乐器", "detail": "购买或租赁钢琴/电钢琴"},
    {"step_name": "制定练习计划", "detail": "每周固定时间练习"},
    {"step_name": "坚持执行并复盘", "detail": "每月回顾进度调整计划"}
  ]

【生成规则】：
- 步骤数 3-6 个，视复杂度而定
- 按逻辑/时间先后排序
- 每步 step_name 用 6-10 个字的动词短语
- detail 简要解释这一步要做什么
- when_hint 可选，提示"何时做"
- 如果输入过于模糊（如"今天好累"），返回空数组`,
    response_json_schema: {
      type: "object",
      properties: {
        chain: {
          type: "array",
          items: {
            type: "object",
            properties: {
              step_name: { type: "string" },
              detail: { type: "string" },
              when_hint: { type: "string" },
            },
            required: ["step_name"],
          },
        },
      },
    },
  });

  const chain = result?.chain;
  if (!Array.isArray(chain) || chain.length === 0) return null;
  return chain;
}