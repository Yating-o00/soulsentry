import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';

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
        
        try {
            const user = await base44.auth.me();
            if (!user) {
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
        } catch (e) {
            return Response.json({ error: 'Authentication failed' }, { status: 401 });
        }

        let body;
        try {
            body = await req.json();
        } catch (e) {
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { input, startDate } = body;
        console.log(`Generating plan for: ${input?.substring(0, 50)}...`);

        if (!input) {
            return Response.json({ error: 'Input is required' }, { status: 400 });
        }

        const prompt = `You are an expert personal planner AI. Your goal is to parse user input about their week and generate a structured plan.
        
        Current context:
        - Start date of the week: ${startDate || new Date().toISOString().split('T')[0]}
        
        User Input: "${input}"
        
        You need to extract/generate:
        1. events: A list of specific events mentioned or implied.
        2. device_strategies: For each device (phone, watch, glasses, car, home, pc), define a specific strategy/role for this week based on the user's intent.
        3. automations: Suggested automated tasks to help achieve the user's goals.
        4. summary: A brief summary of the week's theme.
        5. stats: Estimated counts for focus sessions, travel, etc.
        `;

        const responseSchema = {
            type: "object",
            properties: {
                summary: { type: "string" },
                theme: { type: "string" },
                events: {
                    type: "array",
                    items: {
                        type: "object",
                        properties: {
                            day_index: { type: "number", description: "0-6, where 0 is Monday" },
                            title: { type: "string" },
                            time: { type: "string" },
                            type: { type: "string", enum: ["work", "meeting", "travel", "focus", "rest", "other"] },
                            icon: { type: "string", description: "emoji" }
                        },
                        required: ["day_index", "title", "time", "type"]
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
                            status: { type: "string", enum: ["active", "pending"] }
                        }
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
            required: ["summary", "theme", "events", "device_strategies"]
        };

        console.log("Calling InvokeLLM...");
        
        // Use built-in integration which handles providers/keys
        const result = await base44.integrations.Core.InvokeLLM({
            prompt: prompt,
            response_json_schema: responseSchema
        });

        console.log("InvokeLLM success");

        // The result is already a dict if schema is provided
        let plan = result;
        
        // Safety checks
        if (typeof plan === 'string') {
            try {
                plan = JSON.parse(plan);
            } catch (e) {
                console.error("Failed to parse string response:", e);
                throw new Error("Invalid AI response format");
            }
        }

        // Ensure required fields
        if (!plan.events) plan.events = [];
        if (!plan.device_strategies) plan.device_strategies = {};
        if (!plan.automations) plan.automations = [];
        
        return Response.json(plan);

    } catch (error) {
        console.error('Error in generateWeekPlan:', error);
        
        // Provide a clearer error message to the client
        const errorMessage = error.message?.includes("401") 
            ? "AI Service Authentication Failed. Please check API keys." 
            : error.message;
            
        return Response.json({ error: errorMessage }, { status: 500 });
    }
});