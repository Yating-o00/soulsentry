import { fetch } from 'node-fetch';

export default async function(args) {
    const { prompt } = args;
    const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

    if (!apiKey) {
        throw new Error("GOOGLE_GEMINI_API_KEY is not set");
    }

    if (!prompt) {
        throw new Error("Prompt is required");
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{ text: prompt }]
                }]
            })
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        
        // Extract the text from the response
        const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        
        return {
            success: true,
            text: generatedText || "No response generated",
            raw: data
        };

    } catch (error) {
        console.error("Gemini Function Error:", error);
        return {
            success: false,
            error: error.message
        };
    }
}