import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Trash2, Search, BookOpen, TrendingUp, Calendar, Tag, RotateCcw, ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { canRestoreKnowledge, restoreHint, restoreKnowledgeItem } from "./knowledgeRestore";
import TaskKnowledgeSnapshot from "./TaskKnowledgeSnapshot";

export default function KnowledgeBaseManager() {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const queryClient = useQueryClient();

  const { data: knowledgeItems = [], isLoading } = useQuery({
    queryKey: ['knowledge-base'],
    queryFn: () => base44.entities.KnowledgeBase.list('-created_date'),
    initialData: []
  });

  const deleteKnowledgeMutation = useMutation({
    mutationFn: (id) => base44.entities.KnowledgeBase.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success("知识条目已删除");
    }
  });

  // 沉淀返还：约定回到进行中、心签去掉已沉淀标记，知识副本移除
  const restoreMutation = useMutation({
    mutationFn: (id) => restoreKnowledgeItem(id),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success(data?.source_type === "task" ? "已返还到约定列表" : "已返还到心签列表");
    },
    onError: (err) => {
      toast.error(err?.message || "返还失败");
    }
  });

  const handleRestore = (item) => {
    if (restoreMutation.isPending) return;
    if (window.confirm(restoreHint(item))) {
      restoreMutation.mutate(item.id);
    }
  };

  const filteredItems = knowledgeItems.filter(item => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.title?.toLowerCase().includes(query) ||
      item.content?.toLowerCase().includes(query) ||
      item.tags?.some(tag => tag.toLowerCase().includes(query))
    );
  });

  const getSourceIcon = (sourceType) => {
    switch (sourceType) {
      case 'note':
        return '📝';
      case 'task':
        return '🤝';
      case 'ai_analysis':
        return '🤖';
      default:
        return '✍️';
    }
  };

  const getSourceLabel = (item) => {
    if (item.source_type === 'note') return '来源：心签沉淀';
    if (item.source_type === 'task') return '来源：约定沉淀';
    return '来源：手动添加';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">知识库管理</h2>
          <p className="text-sm text-slate-600">
            共 {knowledgeItems.length} 条知识
          </p>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input
          placeholder="搜索知识库..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-800">
                {knowledgeItems.length}
              </div>
              <div className="text-xs text-slate-500">总条目数</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center">
              <TrendingUp className="w-5 h-5 text-green-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-800">
                {knowledgeItems.reduce((sum, item) => sum + (item.access_count || 0), 0)}
              </div>
              <div className="text-xs text-slate-500">总访问次数</div>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-purple-100 flex items-center justify-center">
              <Tag className="w-5 h-5 text-purple-600" />
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-800">
                {new Set(knowledgeItems.flatMap(item => item.tags || [])).size}
              </div>
              <div className="text-xs text-slate-500">不同标签</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Knowledge Items */}
      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredItems.map((item) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100 }}
              layout
            >
              <Card
                className="p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-lg">{getSourceIcon(item.source_type)}</span>
                      <h3 className="font-semibold text-slate-800 truncate">
                        {item.title}
                      </h3>
                    </div>

                    {item.summary && expandedId !== item.id && (
                      <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                        {item.summary}
                      </p>
                    )}
                    {!item.summary && expandedId !== item.id && (
                      <p className="text-sm text-slate-600 mb-2 line-clamp-2">
                        {item.content}
                      </p>
                    )}

                    <div className="flex items-center gap-2 text-xs text-slate-500 mb-2">
                      <Calendar className="w-3 h-3" />
                      <span>
                        {format(new Date(item.created_date), "yyyy年M月d日", { locale: zhCN })}
                      </span>
                      {item.access_count > 0 && (
                        <>
                          <span>•</span>
                          <TrendingUp className="w-3 h-3" />
                          <span>访问 {item.access_count} 次</span>
                        </>
                      )}
                    </div>

                    {item.tags && item.tags.length > 0 && expandedId !== item.id && (
                      <div className="flex flex-wrap gap-1">
                        {item.tags.map((tag) => (
                          <Badge key={tag} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); setExpandedId(expandedId === item.id ? null : item.id); }}
                      className="text-slate-400 hover:text-slate-600"
                      title={expandedId === item.id ? "收起" : "展开查看完整信息"}
                    >
                      <ChevronDown className={`w-4 h-4 transition-transform ${expandedId === item.id ? "rotate-180" : ""}`} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => { e.stopPropagation(); deleteKnowledgeMutation.mutate(item.id); }}
                      className="text-slate-400 hover:text-red-500"
                      title="删除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* 展开：完整信息 */}
                <AnimatePresence initial={false}>
                  {expandedId === item.id && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      transition={{ duration: 0.18 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 mt-3 border-t border-slate-100 space-y-3">
                        <p className="text-xs text-slate-400">{getSourceLabel(item)}</p>

                        {item.summary && (
                          <div>
                            <p className="text-xs font-medium text-slate-500 mb-1">摘要</p>
                            <p className="text-sm text-slate-700 whitespace-pre-wrap">{item.summary}</p>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-medium text-slate-500 mb-1">完整内容</p>
                          <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{item.content}</p>
                        </div>

                        {item.source_type === 'task' && <TaskKnowledgeSnapshot item={item} />}

                        {item.key_points && item.key_points.length > 0 && (
                          <div>
                            <p className="text-xs font-medium text-slate-500 mb-1">要点</p>
                            <ul className="space-y-1">
                              {item.key_points.map((point, idx) => (
                                <li key={idx} className="text-sm text-slate-700 flex gap-2">
                                  <span className="text-purple-500 flex-shrink-0">•</span>
                                  <span>{point}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}

                        {item.tags && item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map((tag) => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-1">
                          <span className="text-xs text-slate-400">
                            更新于 {format(new Date(item.updated_date), "yyyy年M月d日 HH:mm", { locale: zhCN })}
                          </span>
                          {canRestoreKnowledge(item) && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={(e) => { e.stopPropagation(); handleRestore(item); }}
                              disabled={restoreMutation.isPending}
                              className="text-purple-600 border-purple-200 hover:bg-purple-50 hover:text-purple-700"
                            >
                              <RotateCcw className="w-3.5 h-3.5 mr-1" />
                              返还{item.source_type === "task" ? "约定" : "心签"}
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            </motion.div>
          ))}
        </AnimatePresence>

        {filteredItems.length === 0 && (
          <div className="text-center py-12">
            <BookOpen className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-slate-700 mb-2">
              {searchQuery ? "未找到相关知识" : "知识库为空"}
            </h3>
            <p className="text-sm text-slate-500">
              {searchQuery ? "试试其他搜索词" : "开始从心签中添加知识吧"}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}