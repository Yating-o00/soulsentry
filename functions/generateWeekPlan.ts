import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai@4.28.0';

const openai = new OpenAI({
    apiKey: Deno.env.get("OPENAI_API_KEY"),
});

Deno.serve(async (req) => {
    try {
        // Handle CORS
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
                }
            });
        }

        const base44 = createClientFromRequest(req);
        
        // Simple auth check
        try {
            const user = await base44.auth.me();
            if (!user) {
                console.log("User not authenticated");
                return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }
        } catch (e) {
            console.error("Auth check failed:", e);
            // Continue if auth fails? No, block.
            return Response.json({ error: 'Authentication failed' }, { status: 401 });
        }

        let body;
        try {
            body = await req.json();
        } catch (e) {
            console.error("Failed to parse request body:", e);
            return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
        }

        const { input, startDate } = body;
        console.log(`Generating plan for: ${input?.substring(0, 50)}...`);

        if (!input) {
            return Response.json({ error: 'Input is required' }, { status: 400 });
        }

        try {
            const completion = await openai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `You are an expert personal planner AI. Your goal is to parse user input about their week and generate a structured plan.
                        
                        Current context:
                        - Start date of the week: ${startDate || new Date().toISOString().split('T')[0]}
                        
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
                response_format: { type: "json_object" } // Force JSON object mode
            });

            const content = completion.choices[0].message.content;
            console.log("OpenAI response received");

            let plan;
            try {
                plan = JSON.parse(content);
            } catch (e) {
                console.error("Failed to parse OpenAI response:", e);
                // Fallback: try to clean markdown
                const cleaned = content.replace(/```json/g, '').replace(/```/g, '').trim();
                plan = JSON.parse(cleaned);
            }

            // Ensure required fields exist
            if (!plan.events) plan.events = [];
            if (!plan.device_strategies) plan.device_strategies = {};
            if (!plan.automations) plan.automations = [];
            
            return Response.json(plan);

        } catch (aiError) {
            console.error("OpenAI API error:", aiError);
            return Response.json({ error: 'AI processing failed: ' + aiError.message }, { status: 500 });
        }

    } catch (error) {
        console.error('Critical error in generateWeekPlan:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});