import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import GlobalCreatePanel from "./GlobalCreatePanel";

const FORGE_KEY = "xz_template_forge_at";
const DAY_MS = 24 * 60 * 60 * 1000;

// 全局唯一创建入口的宿主：⌘/Ctrl + J 或 window 事件 'open-global-create' 唤起。
// 同时按天节流地熔炼「个人模板」，让约定数据持续长成越用越贴身的模板。
export default function GlobalCreateHost() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key?.toLowerCase() === "j" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    const onEvent = () => setOpen(true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("open-global-create", onEvent);
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("open-global-create", onEvent);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const forge = () => {
      try {
        const last = Number(localStorage.getItem(FORGE_KEY) || 0);
        if (Date.now() - last < DAY_MS) return;
        localStorage.setItem(FORGE_KEY, String(Date.now()));
        base44.functions.invoke("forgePersonalTemplates", {}).catch(() => {});
      } catch (_) {
        /* ignore */
      }
    };
    const timer = setTimeout(() => {
      if (!cancelled) forge();
    }, 8000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, []);

  return <GlobalCreatePanel open={open} onOpenChange={setOpen} />;
}