import { createClientFromRequest } from 'npm:@base44/sdk@0.8.3';
import OpenAI from 'npm:openai@^4.50.0';

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

        if (!Deno.env.get("OPENAI_API_KEY")) {
            throw new Error("Missing OPENAI_API_KEY");
        }

        console.log("Generating plan for input:", input);

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
                type: "json_object"
            }
        });

        const content = completion.choices[0].message.content;
        console.log("OpenAI response:", content);
        
        let plan;
        try {
            plan = JSON.parse(content);
        } catch (e) {
            console.error("Failed to parse JSON:", e);
            throw new Error("Failed to parse AI response");
        }

        return Response.json(plan);

    } catch (error) {
        console.error('Error generating week plan:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
});