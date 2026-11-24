import React, { useEffect, useState } from "react";
import { httpRequest } from "@/api/httpClient";
import { getChatAiProvider, setChatAiProvider } from "@/api/aiPreference";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function ChatAiSettings() {
  const [options, setOptions] = useState(null);
  const [provider, setProvider] = useState(getChatAiProvider);
  const [error, setError] = useState("");
  useEffect(() => {
    httpRequest("/api/companion/ai-options").then((result) => {
      setOptions(result);
      if (!result.enabled || (getChatAiProvider() === "deepseek" && !result.deepseekAvailable)) {
        setChatAiProvider(""); setProvider("");
      }
    }).catch(() => {});
  }, []);
  if (!options?.enabled) return null;
  return <Card>
    <CardHeader><CardTitle>AI 模型 · 实验功能</CardTitle></CardHeader>
    <CardContent className="space-y-3">
      <label htmlFor="chat-ai-provider" className="block text-sm">对话模型</label>
      <select id="chat-ai-provider" value={provider} className="w-full rounded-lg border p-2" onChange={(event) => {
        try { setChatAiProvider(event.target.value); setProvider(event.target.value); setError(""); }
        catch { setError("浏览器无法保存设置，请检查存储权限。"); }
      }}>
        <option value="">系统默认（{options.defaultProvider === "deepseek" ? "DeepSeek" : "Kimi 优先"}）</option>
        <option value="kimi">Kimi 优先</option>
        <option value="deepseek" disabled={!options.deepseekAvailable}>DeepSeek（实验）{!options.deepseekAvailable ? " · 暂不可用" : ""}</option>
      </select>
      <p className="text-xs text-stone-500">用于小助手、搭子聊天与心签的文本分析，从下一条消息生效，仅保存在当前浏览器。Kimi 不可用时会尝试 DeepSeek；图片与联网继续使用原有服务。</p>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    </CardContent>
  </Card>;
}
