import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    try {
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
                }
            });
        }

        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { input, startDate } = await req.json();

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert personal planner AI. Your goal is to parse user input about their week and generate a structured plan.
                    
                    Current context:
                    - Start date of the week: ${startDate}
                    
                    You need to extract/generate:
                    1. events: A list of specific events mentioned or implied.
                    2. device_strategies: For each device (phone, watch, glasses, car, home, pc), define a specific strategy/role for this week based on the user's intent.
                    3. automations: Suggested automated tasks to help achieve the user's goals.
                    4. summary: A brief summary of the week's theme.
                    5. stats: Estimated counts for focus sessions, travel, etc.

                    Return JSON only.`
                },
                {
                    role: "user",
                    content: input
                }
            ],
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "week_plan",
                    schema: {
                        type: "object",
                        properties: {
                            summary: { type: "string" },
                            theme: { type: "string" },
                            events: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        day_index: { type: "number", description: "0 for Monday, 6 for Sunday" },
                                        title: { type: "string" },
                                        time: { type: "string" },
                                        type: { type: "string", enum: ["work", "meeting", "travel", "focus", "rest", "other"] },
                                        icon: { type: "string", description: "Emoji icon" }
                                    },
                                    required: ["day_index", "title", "type"]
                                }
                            },
                            device_strategies: {
                                type: "object",
                                properties: {
                                    phone: { type: "string" },
                                    watch: { type: "string" },
                                    glasses: { type: "string" },
                                    car: { type: "string" },
                                    home: { type: "string" },
                                    pc: { type: "string" }
                                }
                            },
                            automations: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        title: { type: "string" },
                                        description: { type: "string" },
                                        icon: { type: "string" },
                                        status: { type: "string", enum: ["active", "pending", "ready"] }
                                    },
                                    required: ["title", "description", "status"]
                                }
                            },
                            stats: {
                                type: "object",
                                properties: {
                                    focus_hours: { type: "number" },
                                    meetings: { type: "number" },
                                    travel_days: { type: "number" }
                                }
                            }
                        },
                        required: ["summary", "theme", "events", "device_strategies", "automations", "stats"]
                    }
                }
            }
        });

        const plan = JSON.parse(completion.choices[0].message.content);

        return Response.json(plan);

    } catch (error) {
        console.error('Error generating week plan:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});