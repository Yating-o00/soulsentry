import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import { format, startOfMonth, endOfMonth, eachWeekOfInterval, endOfWeek } from 'npm:date-fns@3.6.0';

export default Deno.serve(async (req) => {
    // Handle CORS preflight
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
        const { input, startDate } = body; // startDate should be YYYY-MM-01

        const monthStart = new Date(startDate);
        const monthEnd = endOfMonth(monthStart);
        const weeks = eachWeekOfInterval({ start: monthStart, end: monthEnd });

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
                    "week_label": "Week 1 (Date-Date)",
                    "focus": "Main focus for this week",
                    "key_events": ["Event 1", "Event 2"]
                }
                // ... for all weeks in the month
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
        `;

        const completion = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            response_json_schema: {
                type: "object",
                properties: {
                    theme: { type: "string" },
                    summary: { type: "string" },
                    stats: {
                        type: "object",
                        properties: {
                            focus_hours: { type: "number" },
                            milestones_count: { type: "number" }
                        }
                    },
                    weeks_breakdown: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                week_label: { type: "string" },
                                focus: { type: "string" },
                                key_events: { type: "array", items: { type: "string" } }
                            }
                        }
                    },
                    key_milestones: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                title: { type: "string" },
                                deadline: { type: "string" },
                                type: { type: "string" }
                            }
                        }
                    },
                    strategies: {
                        type: "object",
                        properties: {
                            work_life_balance: { type: "string" },
                            energy_management: { type: "string" }
                        }
                    }
                },
                required: ["theme", "summary", "weeks_breakdown"]
            }
        });

        // Add plan_start_date to the response
        const responseData = {
            ...completion,
            plan_start_date: startDate
        };

        return Response.json(responseData, {
            headers: { 'Access-Control-Allow-Origin': '*' }
        });

    } catch (error) {
        console.error("Generate Month Plan Error:", error);
        return Response.json({ error: error.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
});