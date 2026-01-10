import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Sparkles, Send, Loader2, BookOpen, Search, Trash2, Plus, Brain, Filter, TrendingUp } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import { SmartSearchEngine } from "./SmartSearchEngine";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export default function AIKnowledgeBase({ open, onOpenChange }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchMode, setSearchMode] = useState("ai"); // "ai" or "advanced"
  const [advancedFilters, setAdvancedFilters] = useState({
    fuzzyMatch: true,
    semanticSearch: false,
    recentOnly: false,
    sortBy: "relevance"
  });
  const [userPreferences, setUserPreferences] = useState(null);
  const scrollRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: knowledgeItems = [] } = useQuery({
    queryKey: ['knowledge-base'],
    queryFn: () => base44.entities.KnowledgeBase.list('-created_date'),
    enabled: open,
    initialData: []
  });

  // 加载用户偏好
  useEffect(() => {
    if (open) {
      SmartSearchEngine.getUserPreferences().then(prefs => {
        setUserPreferences(prefs);
      });
    }
  }, [open]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleAsk = async () => {
    if (!query.trim() || isProcessing) return;

    const userMessage = query;
    setQuery("");
    setMessages(prev => [...prev, { role: "user", content: userMessage }]);
    setIsProcessing(true);

    try {
      if (searchMode === "advanced") {
        // 高级搜索模式 - 使用智能搜索引擎
        const searchResults = await SmartSearchEngine.search(
          userMessage, 
          knowledgeItems,
          userPreferences || {}
        );

        if (searchResults.results.length === 0) {
          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: "未找到匹配的知识条目。\n\n" +
                     `🔍 **搜索解析**：\n` +
                     `- 关键词：${searchResults.parsedQuery.keywords.join(", ")}\n` +
                     `- 逻辑：${searchResults.parsedQuery.operator}\n` +
                     `- 模式：${searchResults.parsedQuery.searchMode}\n\n` +
                     `💡 建议：尝试使用不同的关键词或切换到AI问答模式。`,
            searchResults: searchResults.results,
            parsedQuery: searchResults.parsedQuery
          }]);
        } else {
          // 显示搜索结果摘要
          const resultSummary = searchResults.results.slice(0, 10).map((item, idx) => 
            `**[${idx + 1}] ${item.title}** (相关度: ${item.relevanceScore || 0})\n` +
            `${item.summary || item.content.slice(0, 100)}...\n` +
            `🏷️ ${(item.tags || []).join(", ")}\n` +
            `📊 访问: ${item.access_count || 0}次\n`
          ).join("\n");

          setMessages(prev => [...prev, { 
            role: "assistant", 
            content: `找到 **${searchResults.totalCount}** 条相关结果：\n\n` +
                     `🔍 **搜索解析**：\n` +
                     `- 关键词：${searchResults.parsedQuery.keywords.join(", ")}\n` +
                     `- 逻辑：${searchResults.parsedQuery.operator}\n` +
                     `- 模式：${searchResults.parsedQuery.searchMode}\n` +
                     `- 排序：${searchResults.parsedQuery.orderBy}\n\n` +
                     `📚 **搜索结果**（按${searchResults.parsedQuery.orderBy}排序）：\n\n` +
                     resultSummary,
            searchResults: searchResults.results,
            parsedQuery: searchResults.parsedQuery
          }]);

          // 记录搜索行为
          if (searchResults.results.length > 0) {
            SmartSearchEngine.recordSearchBehavior(
              userMessage, 
              searchResults.results[0].id
            );
          }
        }
      } else {
        // AI问答模式
        const searchPrompt = `Based on the user's question: "${userMessage}"
        
        Search through the following knowledge base entries and provide a comprehensive answer:
        
        ${knowledgeItems.slice(0, 20).map((item, idx) => `
        [Entry ${idx + 1}]
        Title: ${item.title}
        Content: ${item.content.slice(0, 500)}...
        Tags: ${item.tags?.join(", ") || "无"}
        ${item.summary ? `Summary: ${item.summary}` : ""}
        `).join("\n\n")}
        
        Instructions:
        1. Find the most relevant entries for the user's question
        2. Synthesize information from multiple entries if needed
        3. Provide a clear, well-structured answer
        4. If no relevant information is found, say so honestly
        5. Include references to the entry titles you used
        
        Format your answer in markdown for better readability.`;

        const response = await base44.integrations.Core.InvokeLLM({
          prompt: searchPrompt,
          add_context_from_internet: knowledgeItems.length === 0
        });

        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: response 
        }]);

        // 更新被引用条目的访问次数
        const referencedTitles = knowledgeItems
          .filter(item => response.toLowerCase().includes(item.title.toLowerCase()))
          .map(item => item.id);
        
        for (const id of referencedTitles) {
          const item = knowledgeItems.find(k => k.id === id);
          if (item) {
            await base44.entities.KnowledgeBase.update(id, {
              access_count: (item.access_count || 0) + 1,
              last_accessed: new Date().toISOString()
            });
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    } catch (error) {
      console.error("搜索失败:", error);
      toast.error("搜索失败: " + (error.message || "未知错误"));
      setMessages(prev => [...prev, { 
        role: "assistant", 
        content: "抱歉，搜索遇到问题。请稍后重试。" 
      }]);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleQuickSearch = async (searchTerm) => {
    setQuery(searchTerm);
    // Auto-trigger search
    setTimeout(() => {
      handleAsk();
    }, 100);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 bg-gradient-to-r from-purple-50 to-blue-50">
        <div className="flex items-center gap-3 mb-2">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center shadow-lg">
            <Brain className="w-6 h-6 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-800">AI 知识库助手</h2>
            <p className="text-xs text-slate-600">
              已收录 {knowledgeItems.length} 条知识
            </p>
          </div>
        </div>

        {/* Search Mode Toggle & Quick Actions */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex gap-2 flex-wrap">
        <Badge 
        variant={searchMode === "ai" ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => setSearchMode("ai")}
        >
        <Sparkles className="w-3 h-3 mr-1" />
        AI问答
        </Badge>
        <Badge 
        variant={searchMode === "advanced" ? "default" : "outline"}
        className="cursor-pointer"
        onClick={() => setSearchMode("advanced")}
        >
        <TrendingUp className="w-3 h-3 mr-1" />
        高级搜索
        </Badge>
        </div>

        <Popover>
        <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-8 gap-1">
          <Filter className="w-3.5 h-3.5" />
          <span className="text-xs">搜索选项</span>
        </Button>
        </PopoverTrigger>
        <PopoverContent className="w-64" align="end">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium text-sm">搜索设置</h4>

            <div className="flex items-center justify-between">
              <Label htmlFor="fuzzy" className="text-xs">模糊匹配</Label>
              <Switch 
                id="fuzzy"
                checked={advancedFilters.fuzzyMatch}
                onCheckedChange={(checked) => 
                  setAdvancedFilters(prev => ({...prev, fuzzyMatch: checked}))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="semantic" className="text-xs">语义搜索</Label>
              <Switch 
                id="semantic"
                checked={advancedFilters.semanticSearch}
                onCheckedChange={(checked) => 
                  setAdvancedFilters(prev => ({...prev, semanticSearch: checked}))
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="recent" className="text-xs">仅最近内容</Label>
              <Switch 
                id="recent"
                checked={advancedFilters.recentOnly}
                onCheckedChange={(checked) => 
                  setAdvancedFilters(prev => ({...prev, recentOnly: checked}))
                }
              />
            </div>
          </div>

          <div className="pt-2 border-t">
            <p className="text-xs text-slate-500 mb-2">快速查询</p>
            <div className="flex flex-col gap-1">
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start h-8"
                onClick={() => {
                  setQuery("最近的重要内容");
                  handleQuickSearch("最近的重要内容");
                }}
              >
                最近的重要内容
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                className="justify-start h-8"
                onClick={() => {
                  setQuery("AI相关笔记");
                  handleQuickSearch("AI相关笔记");
                }}
              >
                AI相关笔记
              </Button>
            </div>
          </div>
        </div>
        </PopoverContent>
        </Popover>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 && (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-center py-12"
            >
              <Brain className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-slate-700 mb-2">
                开始对话
              </h3>
              <p className="text-sm text-slate-500 mb-4">
                提出任何问题，我会从你的知识库中找到答案
              </p>
              <div className="flex flex-col gap-2 max-w-xs mx-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickSearch("我最近记录了什么重要的想法？")}
                >
                  我最近记录了什么？
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleQuickSearch("帮我找一下关于健康的笔记")}
                >
                  查找特定主题
                </Button>
              </div>
            </motion.div>
          )}

          <AnimatePresence>
            {messages.map((msg, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                      : "bg-slate-100 text-slate-800"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <ReactMarkdown
                      className="prose prose-sm max-w-none [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                      components={{
                        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                        ul: ({ children }) => <ul className="ml-4 mb-2 list-disc">{children}</ul>,
                        ol: ({ children }) => <ol className="ml-4 mb-2 list-decimal">{children}</ol>,
                        li: ({ children }) => <li className="mb-1">{children}</li>,
                        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                        code: ({ inline, children }) => 
                          inline ? (
                            <code className="bg-slate-200 px-1 py-0.5 rounded text-xs">{children}</code>
                          ) : (
                            <code className="block bg-slate-200 p-2 rounded text-xs my-2">{children}</code>
                          )
                      }}
                    >
                      {msg.content}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm">{msg.content}</p>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-start"
            >
              <div className="bg-slate-100 rounded-2xl px-4 py-3">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
              </div>
            </motion.div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-slate-200 bg-white">
      <div className="mb-2">
      {searchMode === "advanced" && (
      <div className="flex gap-1 mb-2 flex-wrap">
        <Badge variant="outline" className="text-[10px]">
          支持: "AI and 机器学习"
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          "健康 or 运动"
        </Badge>
        <Badge variant="outline" className="text-[10px]">
          "工作 not 完成"
        </Badge>
      </div>
      )}
      </div>
      <div className="flex gap-2">
      <Input
      placeholder={searchMode === "ai" ? "问我任何问题..." : "输入搜索条件（支持布尔逻辑）..."}
      value={query}
      onChange={(e) => setQuery(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          handleAsk();
        }
      }}
      className="flex-1"
      disabled={isProcessing}
      />
      <Button
      onClick={handleAsk}
      disabled={!query.trim() || isProcessing}
      className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
      >
      {isProcessing ? (
        <Loader2 className="w-5 h-5 animate-spin" />
      ) : (
        <Send className="w-5 h-5" />
      )}
      </Button>
      </div>
      <p className="text-xs text-slate-500 mt-2">
      {searchMode === "ai" 
      ? "💡 提示: 按 Enter 发送，Shift+Enter 换行" 
      : "🔍 支持: AND、OR、NOT 布尔逻辑，模糊匹配和语义搜索"}
      </p>
      </div>
    </div>
  );
}