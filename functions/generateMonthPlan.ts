import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import { format, startOfMonth, endOfMonth, eachWeekOfInterval } from 'npm:date-fns@3.6.0';
import OpenAI from 'npm:openai';

const MOCK_PLAN = {
    theme: "演示月度：全面突破",
    summary: "本月将专注于核心项目的突破性进展，同时兼顾个人健康与学习。这是一个充满挑战但也充满机遇的月份，关键在于保持节奏和精力管理。",
    stats: {
        focus_hours: 120,
        milestones_count: 5
    },
    weeks_breakdown: [
        {
            week_label: "第一周 (启动)",
            focus: "项目启动与需求确认",
            key_events: ["需求评审会", "技术方案制定", "团队动员"]
        },
        {
            week_label: "第二周 (攻坚)",
            focus: "核心功能开发与早起打卡",
            key_events: ["核心模块编码", "晨跑3次", "读书笔记分享"]
        },
        {
            week_label: "第三周 (测试)",
            focus: "功能测试与Bug修复",
            key_events: ["集成测试", "性能优化", "家庭聚餐"]
        },
        {
            week_label: "第四周 (交付)",
            focus: "产品上线与月度总结",
            key_events: ["产品发布会", "用户反馈收集", "月度复盘"]
        }
    ],
    key_milestones: [
        { title: "完成MVP版本开发", deadline: "2024-03-15", type: "work" },
        { title: "读完《认知觉醒》", deadline: "2024-03-20", type: "study" },
        { title: "体重减重2kg", deadline: "2024-03-31", type: "health" }
    ],
    strategies: {
        work_life_balance: "采用番茄工作法保持专注，每晚10点后不处理工作消息，周末至少留出半天完全放空。",
        energy_management: "保证每天7小时睡眠，午休20分钟，利用晨间黄金时间处理最难的任务。"
    },
    is_demo: true
};

export default Deno.serve(async (req) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        return new Response(null, {
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            },
        });
    }

    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401, headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const body = await req.json();
        const { input, startDate } = body;

        const monthStart = new Date(startDate);
        const monthEnd = endOfMonth(monthStart);

        // Try using OpenAI/Moonshot directly to avoid platform limits
        const apiKey = Deno.env.get("MOONSHOT_API_KEY") || Deno.env.get("OPENAI_API_KEY");
        const baseURL = Deno.env.get("MOONSHOT_API_KEY") ? "https://api.moonshot.cn/v1" : undefined;

        if (!apiKey) {
            console.warn("No API Key found, returning mock data");
            return Response.json({ ...MOCK_PLAN, plan_start_date: startDate }, { headers: { 'Access-Control-Allow-Origin': '*' } });
        }

        const openai = new OpenAI({
            apiKey: apiKey,
            baseURL: baseURL
        });

        const prompt = `
        Role: You are an advanced AI life planner ("Soul Planner").
        Task: Create a comprehensive Monthly Plan based on the user's input.
        
        User Input: "${input}"
        Month Context: ${format(monthStart, 'yyyy-MM')}
        
        Please generate a JSON response with the following structure:
        {
            "theme": "A short, inspiring theme for the month (e.g., 'Month of Growth')",
            "summary": "A concise summary of the month's focus (2-3 sentences)",
            "stats": {
                "focus_hours": Number (estimated total focus hours),
                "milestones_count": Number (number of key goals)
            },
            "weeks_breakdown": [
                {
                    "week_label": "Week N (Brief Focus)",
                    "focus": "Main focus for this week",
                    "key_events": ["Event 1", "Event 2"]
                }
            ],
            "key_milestones": [
                { "title": "Milestone 1", "deadline": "YYYY-MM-DD", "type": "work/personal/health" }
            ],
            "strategies": {
                "work_life_balance": "Strategy for balancing...",
                "energy_management": "Strategy for managing energy..."
            }
        }
        
        Ensure the plan is realistic, structured, and actionable.
        If the user input is vague, infer reasonable goals based on the month context.
        RETURN ONLY JSON. NO MARKDOWN.
        `;

        try {
            const completion = await openai.chat.completions.create({
                messages: [
                    { role: "system", content: "You are a helpful assistant that outputs JSON." },
                    { role: "user", content: prompt }
                ],
                model: Deno.env.get("MOONSHOT_API_KEY") ? "moonshot-v1-8k" : "gpt-4o-mini",
                response_format: { type: "json_object" }
            });

            const content = completion.choices[0].message.content;
            let planData;
            try {
                planData = JSON.parse(content);
            } catch (e) {
                // Fallback if not pure JSON
                const jsonMatch = content.match(/\{[\s\S]*\}/);
                if (jsonMatch) {
                    planData = JSON.parse(jsonMatch[0]);
                } else {
                    throw new Error("Failed to parse JSON");
                }
            }

            return Response.json({
                ...planData,
                plan_start_date: startDate
            }, {
                headers: { 'Access-Control-Allow-Origin': '*' }
            });

        } catch (apiError) {
            console.error("API Call Failed:", apiError);
            // Fallback to mock data on API failure
            return Response.json({ ...MOCK_PLAN, plan_start_date: startDate, is_demo: true, error: apiError.message }, { headers: { 'Access-Control-Allow-Origin': '*' } });
        }

    } catch (error) {
        console.error("Generate Month Plan Critical Error:", error);
        return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
});