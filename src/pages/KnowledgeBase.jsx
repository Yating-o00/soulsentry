import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  Brain, Search, Plus, MessageSquare, Sparkles, BookOpen, 
  Tag, Calendar, TrendingUp, Loader2, Send, Database, Filter,
  Star, Clock, X
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";

const CATEGORIES = ["技术", "工作", "生活", "学习", "健康", "财务", "其他"];

export default function KnowledgeBase() {
  const [searchQuery, setSearchQuery] = useState("");
  const [chatMessages, setChatMessages] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [filters, setFilters] = useState({ category: "all", importance: "all" });
  const [newKnowledge, setNewKnowledge] = useState({
    title: "",
    content: "",
    category: "其他",
    importance: 3,
    tags: []
  });
  const [tagInput, setTagInput] = useState("");
  const chatEndRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: knowledgeItems = [], isLoading } = useQuery({
    queryKey: ['knowledge-base'],
    queryFn: () => base44.entities.KnowledgeBase.list('-created_date'),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.KnowledgeBase.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      setShowAddDialog(false);
      setNewKnowledge({ title: "", content: "", category: "其他", importance: 3, tags: [] });
      toast.success("知识已保存");
    }
  });

  const updateAccessMutation = useMutation({
    mutationFn: ({ id, count }) => base44.entities.KnowledgeBase.update(id, {
      access_count: count + 1,
      last_accessed: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
    }
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages]);

  const filteredItems = knowledgeItems.filter(item => {
    const matchesSearch = searchQuery === "" || 
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.tags?.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    
    const matchesCategory = filters.category === "all" || item.category === filters.category;
    const matchesImportance = filters.importance === "all" || item.importance === parseInt(filters.importance);
    
    return matchesSearch && matchesCategory && matchesImportance;
  });

  const handleAskQuestion = async () => {
    if (!currentQuestion.trim() || isAsking) return;

    const question = currentQuestion.trim();
    setChatMessages(prev => [...prev, { role: "user", content: question }]);
    setCurrentQuestion("");
    setIsAsking(true);

    try {
      // 构建知识库上下文
      const context = knowledgeItems.map(item => 
        `【${item.title}】(${item.category})\n${item.content}\n标签: ${item.tags?.join(", ") || "无"}`
      ).join("\n\n---\n\n");

      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `你是一个智能知识库助手。基于用户的知识库内容回答问题。

知识库内容：
${context}

用户问题：${question}

请基于知识库内容给出准确、有帮助的回答。如果知识库中没有相关信息，请明确说明，并给出一般性建议。回答要简洁、专业。`
      });

      setChatMessages(prev => [...prev, { 
        role: "assistant", 
        content: response,
        relatedItems: findRelatedItems(question)
      }]);
    } catch (error) {
      console.error("AI问答失败:", error);
      toast.error("问答失败，请重试");
      setChatMessages(prev => [...prev, { 
        role: "assistant", 
        content: "抱歉，我暂时无法回答这个问题。请稍后重试。" 
      }]);
    } finally {
      setIsAsking(false);
    }
  };

  const findRelatedItems = (query) => {
    const lowerQuery = query.toLowerCase();
    return knowledgeItems
      .filter(item => 
        item.title.toLowerCase().includes(lowerQuery) ||
        item.content.toLowerCase().includes(lowerQuery) ||
        item.tags?.some(tag => tag.toLowerCase().includes(lowerQuery))
      )
      .slice(0, 3)
      .map(item => item.id);
  };

  const handleItemClick = (item) => {
    updateAccessMutation.mutate({ id: item.id, count: item.access_count || 0 });
    
    setChatMessages(prev => [...prev, 
      { role: "user", content: `告诉我关于"${item.title}"的详细信息` },
      { 
        role: "assistant", 
        content: `**${item.title}**\n\n${item.content}\n\n**分类**：${item.category}\n**标签**：${item.tags?.join(", ") || "无"}`,
        highlightedItem: item.id
      }
    ]);
  };

  const addTag = () => {
    if (tagInput.trim() && !newKnowledge.tags.includes(tagInput.trim())) {
      setNewKnowledge(prev => ({
        ...prev,
        tags: [...prev.tags, tagInput.trim()]
      }));
      setTagInput("");
    }
  };

  const removeTag = (tag) => {
    setNewKnowledge(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const stats = {
    total: knowledgeItems.length,
    byCategory: CATEGORIES.map(cat => ({
      name: cat,
      count: knowledgeItems.filter(item => item.category === cat).length
    })).filter(c => c.count > 0),
    recentlyAccessed: knowledgeItems
      .filter(item => item.last_accessed)
      .sort((a, b) => new Date(b.last_accessed) - new Date(a.last_accessed))
      .slice(0, 5)
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto min-h-screen">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-700 flex items-center justify-center shadow-lg">
              <Brain className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-800">AI 知识库</h1>
              <p className="text-slate-600 text-sm">智能存储 · 快速检索 · AI问答</p>
            </div>
          </div>
        </div>
        <Button
          onClick={() => setShowAddDialog(true)}
          className="bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
        >
          <Plus className="w-4 h-4 mr-2" />
          添加知识
        </Button>
      </motion.div>

      {/* Stats */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
      >
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Database className="w-4 h-4 text-purple-600" />
              知识总量
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">{stats.total}</div>
            <p className="text-xs text-slate-500 mt-1">条知识记录</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              分类分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1">
              {stats.byCategory.map(cat => (
                <Badge key={cat.name} variant="outline" className="text-xs">
                  {cat.name} ({cat.count})
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-600" />
              最近访问
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-1">
              {stats.recentlyAccessed.slice(0, 3).map(item => (
                <div key={item.id} className="text-xs text-slate-600 truncate">
                  • {item.title}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Knowledge List */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <Card>
            <CardHeader>
              <div className="flex items-center gap-3">
                <BookOpen className="w-5 h-5 text-purple-600" />
                <CardTitle>知识库</CardTitle>
              </div>
              <div className="flex gap-2 mt-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="搜索知识..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select value={filters.category} onValueChange={(v) => setFilters(prev => ({...prev, category: v}))}>
                  <SelectTrigger className="w-32">
                    <Filter className="w-4 h-4 mr-2" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">全部分类</SelectItem>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent className="max-h-[500px] overflow-y-auto space-y-3">
              <AnimatePresence mode="popLayout">
                {filteredItems.map(item => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    onClick={() => handleItemClick(item)}
                    className="p-3 bg-slate-50 rounded-lg border border-slate-200 hover:border-purple-300 hover:bg-purple-50/50 cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 truncate">{item.title}</h3>
                        <p className="text-xs text-slate-600 line-clamp-2 mt-1">{item.content}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Badge variant="outline" className="text-xs">{item.category}</Badge>
                          {item.importance >= 4 && (
                            <Badge className="bg-amber-100 text-amber-700 text-xs">
                              <Star className="w-3 h-3 mr-1" />
                              重要
                            </Badge>
                          )}
                          {item.access_count > 0 && (
                            <span className="text-xs text-slate-400">{item.access_count}次访问</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
              {filteredItems.length === 0 && (
                <div className="text-center py-12 text-slate-400">
                  <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>暂无知识记录</p>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* AI Chat */}
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          className="space-y-4"
        >
          <Card className="h-[calc(100vh-280px)] flex flex-col">
            <CardHeader className="flex-shrink-0">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-5 h-5 text-purple-600" />
                <CardTitle>AI 智能问答</CardTitle>
              </div>
              <p className="text-xs text-slate-500 mt-2">基于你的知识库内容回答问题</p>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col overflow-hidden">
              <div className="flex-1 overflow-y-auto space-y-4 mb-4">
                {chatMessages.length === 0 && (
                  <div className="h-full flex items-center justify-center">
                    <div className="text-center text-slate-400">
                      <Sparkles className="w-12 h-12 mx-auto mb-3 opacity-50" />
                      <p className="text-sm">向AI提问任何关于你知识库的问题</p>
                      <p className="text-xs mt-2">例如："我最近学习了哪些技术？"</p>
                    </div>
                  </div>
                )}
                <AnimatePresence>
                  {chatMessages.map((msg, idx) => (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                    >
                      <div className={`max-w-[80%] p-3 rounded-lg ${
                        msg.role === 'user' 
                          ? 'bg-purple-600 text-white' 
                          : 'bg-slate-100 text-slate-800'
                      }`}>
                        <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                        {msg.relatedItems && msg.relatedItems.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-slate-200">
                            <p className="text-xs text-slate-500 mb-1">相关知识：</p>
                            {msg.relatedItems.map(id => {
                              const item = knowledgeItems.find(i => i.id === id);
                              return item ? (
                                <Badge key={id} variant="outline" className="text-xs mr-1">
                                  {item.title}
                                </Badge>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {isAsking && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex justify-start"
                  >
                    <div className="bg-slate-100 p-3 rounded-lg">
                      <Loader2 className="w-4 h-4 animate-spin text-purple-600" />
                    </div>
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>
              
              <div className="flex gap-2 flex-shrink-0">
                <Input
                  placeholder="输入你的问题..."
                  value={currentQuestion}
                  onChange={(e) => setCurrentQuestion(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAskQuestion()}
                  disabled={isAsking}
                />
                <Button
                  onClick={handleAskQuestion}
                  disabled={!currentQuestion.trim() || isAsking}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Add Knowledge Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>添加知识</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-2 block">标题</label>
              <Input
                placeholder="知识标题..."
                value={newKnowledge.title}
                onChange={(e) => setNewKnowledge(prev => ({...prev, title: e.target.value}))}
              />
            </div>
            
            <div>
              <label className="text-sm font-medium mb-2 block">内容</label>
              <Textarea
                placeholder="详细内容..."
                value={newKnowledge.content}
                onChange={(e) => setNewKnowledge(prev => ({...prev, content: e.target.value}))}
                rows={6}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">分类</label>
                <Select value={newKnowledge.category} onValueChange={(v) => setNewKnowledge(prev => ({...prev, category: v}))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">重要程度</label>
                <Select value={newKnowledge.importance.toString()} onValueChange={(v) => setNewKnowledge(prev => ({...prev, importance: parseInt(v)}))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1,2,3,4,5].map(i => (
                      <SelectItem key={i} value={i.toString()}>
                        {"⭐".repeat(i)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">标签</label>
              <div className="flex gap-2 mb-2">
                <Input
                  placeholder="添加标签..."
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && addTag()}
                />
                <Button type="button" onClick={addTag} variant="outline">
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
                {newKnowledge.tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1">
                    {tag}
                    <button onClick={() => removeTag(tag)}>
                      <X className="w-3 h-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
              <Button
                onClick={() => createMutation.mutate(newKnowledge)}
                disabled={!newKnowledge.title.trim() || !newKnowledge.content.trim()}
                className="bg-purple-600 hover:bg-purple-700"
              >
                保存知识
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}