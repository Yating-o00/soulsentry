import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "@/components/TranslationContext";
import { Sparkles, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

// Cache translations in memory to prevent refetching during session
const translationCache = new Map();

export default function AITranslatedText({ text, className, as: Component = "span", placeholder = null }) {
  const { isAIMode } = useTranslation();
  
  const { data: translatedText, isLoading } = useQuery({
    queryKey: ['ai-translation', text],
    queryFn: async () => {
      if (!text || typeof text !== 'string') return text;
      
      // Check cache first
      if (translationCache.has(text)) {
        return translationCache.get(text);
      }

      try {
        const res = await base44.integrations.Core.InvokeLLM({
          prompt: `Translate the following text to English efficiently and accurately. 
          Context: UI element or user content in a productivity app.
          Keep it concise.
          
          Text: "${text}"
          
          Return ONLY the translated text, nothing else.`,
        });
        
        // Cache the result
        const result = typeof res === 'string' ? res.replace(/^"|"$/g, '').trim() : text;
        translationCache.set(text, result);
        return result;
      } catch (e) {
        console.error("Translation failed", e);
        return text;
      }
    },
    enabled: isAIMode && !!text && typeof text === 'string' && text.length > 0,
    staleTime: Infinity, // Keep forever in this session
    cacheTime: Infinity,
  });

  if (!isAIMode || !text) {
    return <Component className={className}>{text || placeholder}</Component>;
  }

  if (isLoading) {
    return (
      <Component className={cn("inline-flex items-center gap-1", className)}>
        <span className="opacity-50">{text}</span>
        <Loader2 className="w-3 h-3 animate-spin text-purple-500" />
      </Component>
    );
  }

  return (
    <Component className={cn("group relative", className)}>
      {translatedText || text}
      <Sparkles className="inline w-3 h-3 ml-1 text-purple-400 opacity-70" />
    </Component>
  );
}