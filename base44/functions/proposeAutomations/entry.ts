import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

/**
 * 把用户的一句话场景拆解成多条"可自动执行的子项候选"
 * 返回 candidates[]，每条带 automation_type / title / detail / when_hint
 * 不写库，纯解析，由前端展示成网格让用户勾选授权
 */

const SCHEMA = {
  type: "object",
  properties: {
    scene_summary: { type: "string", description: "对用户场景的一句话理解" },
    candidates: {
      type: "array",
      description: "可拆解出的自动执行子项，3-6 条",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "子项的简短标题，6-12 字" },
          detail: { type: "string", description: "一句话说明 AI 会替用户做什么，含具体时间/方式" },
          automation_type: {
            type: "string",
            enum: ["email_draft", "file_organize", "web_research", "office_doc", "calendar_event", "summary_note"]
          },
          when_hint: { type: "string", description: "建议触发时间或情境，如 '22:00' / '会议结束后5分钟'" }
        },
        required: ["title", "detail", "automation_type"]
      }
    }
  },
  required: ["candidates"]
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { input } = await req.json();
    if (!input?.trim()) return Response.json({ error: 'input required' }, { status: 400 });

    const res = await base44.functions.invoke('invokeKimi', {
      prompt: `用户输入的场景：${input}\n\n当前时间：${new Date().toISOString()}\n\n请把这个场景拆解成 3-6 条「AI 可以替用户自动完成」的具体子项。每条要有清晰的触发时机或方式，避免泛泛而谈。`,
      response_json_schema: SCHEMA,
      system_prompt: "你是心栈 SoulSentry 的自动执行规划官。把用户输入的场景拆解为可单独授权执行的子项清单，每条要具体、可落地，并标注合适的自动执行类型与触发时机。",
      temperature: 0.5
    });

    const data = res.data;
    if (data?._parse_error) {
      return Response.json({ error: 'AI parsing failed' }, { status: 500 });
    }

    return Response.json({
      scene_summary: data.scene_summary || input,
      candidates: data.candidates || []
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});