import React, { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { base44 } from "@/api/base44Client";

const FALLBACK_LOGO = "https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/6909eb4cffc0d0cc8e4c8442/e19e5553e_image.png";

export default function ShareCardAIIcon({ task }) {
  const [url, setUrl] = useState(task?.ai_share_icon_url || null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!task?.id) return;
    if (task.ai_share_icon_url) {
      setUrl(task.ai_share_icon_url);
      return;
    }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const { url: img } = await base44.integrations.Core.GenerateImage({
          prompt: `A minimalist flat app icon symbolizing "${task.title}".${task.description ? ` Context: ${task.description.slice(0, 120)}.` : ""} One single centered symbol with simple geometric shapes, deep navy blue (#384877) on a pure white background, rounded-square app icon style, no text, no letters, clean vector illustration.`,
        });
        if (!cancelled && img) {
          setUrl(img);
          base44.entities.Task.update(task.id, { ai_share_icon_url: img }).catch(() => {});
        }
      } catch (e) {
        console.error("AI icon generation failed", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [task?.id]);

  if (loading) {
    return (
      <div className="w-10 h-10 flex items-center justify-center">
        <RefreshCw className="w-5 h-5 animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <img
      src={url || FALLBACK_LOGO}
      alt="Icon"
      crossOrigin="anonymous"
      className="w-10 h-10 object-contain rounded-lg"
    />
  );
}