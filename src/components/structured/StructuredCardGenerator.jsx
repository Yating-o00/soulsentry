import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Sparkles, Loader2, FileText, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import StructuredCard from "./StructuredCard";

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    core_conclusion: {
      type: "string",
      description: "用一段话总结文本的核心结论或最重要的洞察（80-150字）",
    },
    action_steps: {
      type: "array",
      items: { type: "string" },
      description: "可执行的行动步骤列表，每条简洁明了（3-6条）",
    },
    related_memories: {
      type: "array",
      items: { type: "string" },
      description: "与文本相关的背景知识、记忆点或值得记住的关键信息（2-5条）",
    },
  },
  required: ["core_conclusion", "action_steps", "related_memories"],
};

const PROMPT_TEMPLATE = (text) =>
  `请阅读下面的长文本，并将其结构化为三个部分：

1. **核心结论**：用一段话提炼文本最重要的观点或结论
2. **行动步骤**：从文本中提取可立即执行的行动建议（按优先级排序）
3. **相关记忆**：值得记住的背景知识、关键信息或可联想到的相关概念

要求：
- 中文输出，语言简洁有力
- 行动步骤要具体、可执行
- 相关记忆要点出值得长期记住的信息

文本内容：
"""
${text}
"""`;

export default function StructuredCardGenerator() {
  const [inputText, setInputText] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);

  const handleGenerate = async () => {
    if (!inputText.trim()) {
      toast.error("请先输入需要结构化的文本");
      return;
    }
    if (inputText.trim().length < 20) {
      toast.error("文本太短了，请至少输入 20 个字符");
      return;
    }

    setLoading(true);
    setResult(null);

    try {
      const { data } = await base44.functions.invoke("invokeKimi", {
        prompt: PROMPT_TEMPLATE(inputText),
        response_json_schema: RESPONSE_SCHEMA,
        temperature: 0.5,
      });

      if (data?._parse_error || data?.error) {
        toast.error("AI 解析失败，请重试");
        console.error("Kimi response error:", data);
        return;
      }

      setResult(data);
      toast.success("结构化完成 ✨");
    } catch (err) {
      console.error("StructuredCard error:", err);
      toast.error("生成失败：" + (err.message || "未知错误"));
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setInputText("");
    setResult(null);
  };

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-8 space-y-6">
      <div className="text-center space-y-2">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-[#384877]/10 to-[#3b5aa2]/10 rounded-full">
          <Sparkles className="w-4 h-4 text-[#384877]" />
          <span className="text-sm font-medium text-[#384877]">Kimi AI 驱动</span>
        </div>
        <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent">
          结构化卡片
        </h1>
        <p className="text-sm text-slate-500">
          粘贴长文本，AI 自动提炼为「核心结论 · 行动步骤 · 相关记忆」
        </p>
      </div>

      <Card className="p-5 rounded-2xl border-slate-200/60 shadow-sm bg-white">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-medium text-slate-700">输入文本</span>
          <span className="ml-auto text-xs text-slate-400">{inputText.length} 字</span>
        </div>
        <Textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="粘贴文章、会议纪要、研究报告等长文本..."
          className="min-h-[200px] resize-none border-slate-200 focus-visible:ring-[#384877]/30 text-sm leading-relaxed"
          disabled={loading}
        />
        <div className="flex gap-2 mt-4">
          <Button
            onClick={handleGenerate}
            disabled={loading || !inputText.trim()}
            className="flex-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:opacity-90 text-white rounded-xl"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                AI 解析中...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                生成结构化卡片
              </>
            )}
          </Button>
          {(inputText || result) && !loading && (
            <Button onClick={handleReset} variant="outline" className="rounded-xl">
              <RotateCcw className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          💡 使用 Kimi AI，会消耗较多集成积分
        </p>
      </Card>

      {result && <StructuredCard data={result} />}
    </div>
  );
}