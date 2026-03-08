import { base44 } from "@/api/base44Client";

/**
 * Unified AI call helper.
 * First tries Base44 InvokeLLM (uses platform credits), 
 * if credits exhausted, automatically falls back to Kimi API via backend function.
 * 
 * @param {object} params - { prompt, response_json_schema?, file_urls?, add_context_from_internet?, model? }
 * @returns {Promise<any>} - AI response (parsed JSON if schema provided, string otherwise)
 */
export async function invokeAI(params) {
  // 1) Try InvokeLLM directly first (faster, no backend function overhead)
  try {
    const result = await base44.integrations.Core.InvokeLLM(params);
    return result;
  } catch (e) {
    console.warn('[invokeAI] InvokeLLM failed, falling back to Kimi backend:', e?.message || e);
  }

  // 2) Fallback to backend callAI function (uses Kimi API)
  const response = await base44.functions.invoke('callAI', {
    prompt: params.prompt,
    response_json_schema: params.response_json_schema,
    file_urls: params.file_urls,
    add_context_from_internet: params.add_context_from_internet,
    model: params.model
  });

  if (response?.data?.data !== undefined) {
    return response.data.data;
  }

  if (response?.data?.error) {
    throw new Error(response.data.error);
  }

  throw new Error('AI service unavailable');
}