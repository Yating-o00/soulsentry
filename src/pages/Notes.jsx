import React, { useState, useMemo, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StickyNote, Search, Plus, Grid, List as ListIcon, RotateCcw, CalendarIcon, Sparkles, Wand2, Brain, Mic, Globe, User, Lock, Dices, BookOpen, PenLine, Send } from "lucide-react";
import AIText from "@/components/AIText";
import NoteEditor from "../components/notes/NoteEditor";
import NoteCard from "../components/notes/NoteCard";
import NoteFilters from "../components/notes/NoteFilters";
import HeartSignMessage from "../components/heartsign/HeartSignMessage";
import HeartSignInput from "../components/heartsign/HeartSignInput";
import NoteShareDialog from "../components/notes/NoteShareDialog";
import NoteComments from "../components/notes/NoteComments";
import QuickAddTask from "../components/tasks/QuickAddTask";
import AINotesOrganizer from "../components/notes/AINotesOrganizer";
import AIKnowledgeBase from "../components/knowledge/AIKnowledgeBase";
import KnowledgeBaseManager from "../components/knowledge/KnowledgeBaseManager";
import ExternalHorizonPanel from "../components/heartsign/ExternalHorizonPanel";
import CategoryFilterBar from "@/components/heartsign/CategoryFilterBar";
import ReviewDialog from "@/components/heartsign/ReviewDialog";
import JournalDialog from "@/components/heartsign/JournalDialog";
import VaultDialog from "@/components/heartsign/VaultDialog";
import { detectSensitive } from "@/components/heartsign/detectSensitive";
import { normalizeNote, getNoteType, isPinnedNote, isVaultNote, DENSITY_KEY, DENSITY_OPTIONS, classifyNoteText, notePlainText } from "@/components/heartsign/heartSignMeta";
import { isStandaloneMode } from "@/api/platformConfig";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import MobileVoiceNoteInput from "../components/notes/MobileVoiceNoteInput";
import { toast } from "sonner";
import { createExecutionRecord } from "@/components/utils/trackExecution";
import "./heartsign-theme.css";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle } from
"@/components/ui/dialog";

export default function Notes() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isAnalyzingNote, setIsAnalyzingNote] = useState(false);
  const [editingNote, setEditingNote] = useState(null);
  const [taskCreationNote, setTaskCreationNote] = useState(null);
  const [sharingNote, setSharingNote] = useState(null);
  const [showAIOrganizer, setShowAIOrganizer] = useState(false);
  const [showKnowledgeBase, setShowKnowledgeBase] = useState(false);
  const [showKnowledgeManager, setShowKnowledgeManager] = useState(false);
  const [showExternalHorizon, setShowExternalHorizon] = useState(false);
  const [showMobileInput, setShowMobileInput] = useState(false);
  const [activeTab, setActiveTab] = useState("notes");
  const [filters, setFilters] = useState({});
  const [viewMode, setViewMode] = useState("grid");
  const [onlyMine, setOnlyMine] = useState(false);
  // 五类过滤 / 回应浓度 / 回顾 / 保险柜 / 定位闪动
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [density, setDensity] = useState(() => localStorage.getItem(DENSITY_KEY) || "light");
  const [reviewOpen, setReviewOpen] = useState(false);
  const [journalOpen, setJournalOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [vaultOpen, setVaultOpen] = useState(false);
  const [vaultInitialValue, setVaultInitialValue] = useState(null);
  const [flashId, setFlashId] = useState(null);
  const queryClient = useQueryClient();

  // 纯外部信息来源（外部订阅源 / 网页链接 / 微信转发）
  const EXTERNAL_SOURCES = ['external_feed', 'web_link', 'wechat_share'];
  const [searchParams] = useSearchParams();

  // Keyboard shortcut: Ctrl+N to quick create
  useEffect(() => {
    const handleKeyPress = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        setIsCreating(true);
        // Auto-focus on editor immediately
        setTimeout(() => {
          const quillEditor = document.querySelector('.ql-editor');
          if (quillEditor) quillEditor.focus();
        }, 10);
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  // Mobile + 号 → 打开移动端语音/文字输入面板
  useEffect(() => {
    const handler = () => {
      setActiveTab("notes");
      setShowMobileInput(true);
    };
    window.addEventListener('mobile-create-note', handler);
    // 也支持 ?new=1 直接触发
    if (searchParams.get('new') === '1') {
      setTimeout(handler, 100);
    }
    return () => window.removeEventListener('mobile-create-note', handler);
  }, [searchParams]);

  const { data: notes = [], isLoading } = useQuery({
    queryKey: ['notes'],
    queryFn: () => base44.entities.Note.list('-created_date'),
    // 独立后端把 AI 分析放在 metadata.ai_analysis，统一提升到 note.ai_analysis 便于读取
    select: (list) => (list || []).map(normalizeNote),
    initialData: []
  });

  // Handle URL param for opening specific note
  useEffect(() => {
    const noteId = searchParams.get("noteId");
    if (noteId && notes.length > 0) {
      const note = notes.find(n => n.id === noteId);
      if (note) {
        setEditingNote(note);
      } else {
        base44.entities.Note.filter({ id: noteId }).then(res => {
          if (res && res.length > 0) {
             setEditingNote(res[0]);
          }
        });
      }
    }
  }, [searchParams, notes]);

  // 独立后端无实时推送：分析是异步的，轮询补拉一次最新状态（最多约 30 秒）
  const refreshNoteWhenDone = async (id) => {
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 3000));
      try {
        const fresh = normalizeNote(await base44.entities.Note.get(id));
        if (fresh?.ai_status && fresh.ai_status !== 'pending' && fresh.ai_status !== 'processing') {
          queryClient.setQueryData(['notes'], (old) =>
            (old || []).map(n => (n.id === id ? { ...n, ...fresh } : n)));
          return;
        }
      } catch (e) {
        return;
      }
    }
  };

  const handleSmartConvertToTask = async (note) => {
    setIsAnalyzingNote(true);
    toast.info("AI 正在分析笔记内容以生成约定...", { duration: 3000 });

    try {
        const content = note.plain_text || note.content || "";

        // 调用 LLM 分析
        const analysis = await base44.integrations.Core.InvokeLLM({
            prompt: `请分析以下笔记内容，并将其转换为一个待办事项（约定）。提取或生成合适的标题、描述、优先级、分类和建议的截止时间（如果有时间相关描述）。

            笔记内容：
            """
            ${content}
            """

            当前时间：${new Date().toISOString()}

            请返回 JSON 格式：
            {
                "title": "简明扼要的任务标题",
                "description": "详细的任务描述，可以包含笔记原文或整理后的要点",
                "priority": "low/medium/high/urgent",
                "category": "work/personal/health/study/family/shopping/finance/other",
                "reminder_time": "ISO 8601格式的时间字符串，如果笔记中没有明确时间，则留空或设为null"
            }`,
            response_json_schema: {
                type: "object",
                properties: {
                    title: { type: "string" },
                    description: { type: "string" },
                    priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
                    category: { type: "string", enum: ["work", "personal", "health", "study", "family", "shopping", "finance", "other"] },
                    reminder_time: { type: "string", format: "date-time" }
                },
                required: ["title", "description", "priority", "category"]
            }
        });

        // 打开创建对话框，并填充数据
        setTaskCreationNote({
            ...note, // 保留原始笔记引用
            smartData: analysis // 附带智能分析数据
        });

        toast.success("分析完成，请确认约定详情");

    } catch (error) {
        console.error("AI 分析失败:", error);
        toast.error("智能分析失败，将使用原始内容");
        // 降级处理：直接使用原始笔记内容
        setTaskCreationNote(note);
    } finally {
        setIsAnalyzingNote(false);
    }
  };

  // Mutations
  const createNoteMutation = useMutation({
    mutationFn: (data) => base44.entities.Note.create(data),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setIsCreating(false);
      toast.success("心签已创建");

      // 同步执行动态到通知页面（非阻塞）
      const noteTitle = data?.plain_text?.slice(0, 60) || data?.ai_analysis?.summary || "新心签";
      createExecutionRecord({
        title: noteTitle,
        originalInput: data?.plain_text || data?.content || "",
        source: "note",
        category: "note",
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['task-executions'] });
      }).catch(e => console.warn("Execution tracking failed:", e));
    },
    onError: () => {
      // P0 修复：失败必须显式反馈，不能静默吞签
      toast.error("心签发送失败，请重试");
    }
  });

  // 信息流发送管线：敏感预检 → 乐观上屏 → 创建 → 触发 AI 分析 → 轮询补拉
  const handleSend = async (payload) => {
    // 敏感信息拦截：不创建心签，引导存入保险柜
    const hit = detectSensitive(payload.plain_text);
    if (hit) {
      toast.warning(`检测到敏感信息（${hit.label}），建议存入保险柜`, { description: '保险柜内容独立加密，不会进入 AI 分析' });
      setVaultInitialValue(payload.plain_text);
      setVaultOpen(true);
      return;
    }

    const densityNow = localStorage.getItem(DENSITY_KEY) || 'light';
    // 本地预分类：给后端一个提示，最终以 AI/兜底 + 纠错学习闭环为准
    payload.source_type = classifyNoteText(payload.plain_text);
    const withMeta = { ...payload, metadata: { ...(payload.metadata || {}), response_density: densityNow } };

    // 乐观插入（P0 修复：先上屏，失败回滚并提示）
    const optimistic = normalizeNote({
      ...withMeta,
      id: `tmp-${Date.now()}`,
      created_date: new Date().toISOString(),
    });
    queryClient.setQueryData(['notes'], (old) => [optimistic, ...(old || [])]);

    try {
      const created = normalizeNote(await base44.entities.Note.create(withMeta));
      queryClient.setQueryData(['notes'], (old) =>
        (old || []).map(n => (n.id === optimistic.id ? created : n)));
      // 触发 AI 分析（异步，不阻塞）——直接带上笔记内容，绕开后端"查不到笔记"的隔离问题
      base44.functions.invoke('analyzeHeartSign', {
        note_id: created.id,
        note_data: {
          plain_text: created.plain_text,
          content: created.content,
          source_type: created.source_type,
          source_url: created.source_url,
          attachments: created.attachments,
          tags: created.tags,
        },
      }).catch(e => console.error(e));
      // 独立后端无实时推送，轮询补拉分析结果
      refreshNoteWhenDone(created.id);
    } catch (e) {
      queryClient.setQueryData(['notes'], (old) => (old || []).filter(n => n.id !== optimistic.id));
      console.error(e);
      toast.error('心签发送失败，请重试');
    }
  };

  // 给心签打 metadata 标记（已转约定 / 已沉淀），乐观更新缓存并持久化
  const flagNote = (noteId, patchMeta) => {
    if (!noteId) return;
    const note = (queryClient.getQueryData(['notes']) || []).find(n => n.id === noteId);
    const metadata = { ...(note?.metadata || {}), ...patchMeta };
    queryClient.setQueryData(['notes'], (old) =>
      (old || []).map(n => (n.id === noteId ? { ...n, metadata } : n)));
    base44.entities.Note.update(noteId, { metadata }).catch(() => {});
  };

  const createTaskMutation = useMutation({
    mutationFn: (taskData) => {
      const { __noteId, ...rest } = taskData || {};
      return base44.entities.Task.create(rest);
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] }); // Ideally invalidate tasks, but might not be mounted
      if (vars?.__noteId) flagNote(vars.__noteId, { converted_task: true });
      setTaskCreationNote(null);
      toast.success("约定已创建");
    },
    onError: () => {
      toast.error("约定创建失败");
    }
  });

  const updateNoteMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Note.update(id, {
      ...data,
      last_active_at: new Date().toISOString()
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      setEditingNote(null);
      toast.success("心签已更新");
    }
  });

  const deleteNoteMutation = useMutation({
    mutationFn: (id) => base44.entities.Note.update(id, { deleted_at: new Date().toISOString() }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: ['notes'] });
      const previousNotes = queryClient.getQueryData(['notes']);
      queryClient.setQueryData(['notes'], (old) => old ? old.filter(n => n.id !== id) : []);
      return { previousNotes };
    },
    onError: (err, id, context) => {
      queryClient.setQueryData(['notes'], context.previousNotes);
      toast.error("删除失败");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notes'] });
      toast.success("已移至回收站");
    }
  });

  const addToKnowledgeMutation = useMutation({
    mutationFn: (data) => base44.entities.KnowledgeBase.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      toast.success("已添加到知识库");
    }
  });

  const handleAddToKnowledge = async (note) => {
    addToKnowledgeMutation.mutate({
      title: note.ai_analysis?.summary || note.plain_text?.slice(0, 100) || "未命名知识",
      content: note.plain_text || note.content,
      source_type: "note",
      source_id: note.id,
      tags: note.tags || [],
      summary: note.ai_analysis?.summary,
      key_points: note.ai_analysis?.key_points || [],
      category: note.tags?.[0] || "其他"
    });
  };

  const saveToKnowledgeMutation = useMutation({
    mutationFn: async (note) => {
      const knowledgeData = {
        title: note.ai_analysis?.summary || note.plain_text?.slice(0, 50) || "未命名知识",
        content: note.ai_analysis?.key_points ?
          `${note.ai_analysis.summary}\n\n要点：\n${note.ai_analysis.key_points.map(p => `• ${p}`).join('\n')}\n\n原文：\n${note.plain_text}` :
          note.plain_text,
        source_type: "note",
        source_id: note.id,
        tags: note.tags || [],
        category: "其他",
        importance: 3,
        embedding_summary: note.ai_analysis?.summary || note.plain_text?.slice(0, 200)
      };
      return base44.entities.KnowledgeBase.create(knowledgeData);
    },
    onSuccess: (data, note) => {
      queryClient.invalidateQueries({ queryKey: ['knowledge-base'] });
      flagNote(note?.id, { in_knowledge_base: true });
      toast.success("已保存到知识库");
    },
    onError: () => {
      toast.error("保存失败");
    }
  });

  // 置顶：乐观改缓存 + 服务端持久化（metadata.pinned，与小程序口径一致）
  const handlePinnedChange = (note) => {
    if (typeof note.id === 'string' && note.id.startsWith('tmp-')) return;
    const next = !(isPinnedNote(note) || note.is_pinned === true);
    queryClient.setQueryData(['notes'], (old) =>
      (old || []).map(n => (n.id === note.id
        ? { ...n, metadata: { ...(n.metadata || {}), pinned: next }, is_pinned: next }
        : n)));
    base44.entities.Note.update(note.id, {
      metadata: { ...(note.metadata || {}), pinned: next },
      is_pinned: next,
    }).catch(() => {
      toast.error('置顶失败');
      queryClient.invalidateQueries({ queryKey: ['notes'] });
    });
  };

  // 「分错了」纠正：乐观更新缓存，失败回滚
  const handleTypeChange = (note, newType, newLabel) => {
    const prevType = note.source_type;
    const prevLabel = note.ai_analysis?.category;
    queryClient.setQueryData(['notes'], (old) =>
      (old || []).map(n => (n.id === note.id ? {
        ...n,
        source_type: newType,
        ai_analysis: { ...(n.ai_analysis || {}), category: newLabel },
        metadata: { ...(n.metadata || {}), ai_analysis: { ...(n.metadata?.ai_analysis || {}), category: newLabel } },
      } : n)));
    base44.entities.Note.update(note.id, {
      source_type: newType,
      metadata: {
        ...(note.metadata || {}),
        ai_analysis: { ...(note.metadata?.ai_analysis || note.ai_analysis || {}), category: newLabel },
      },
    }).then(() => {
      toast.success(`已归类为「${newLabel}」，谢谢你教我`);
      // 记录这次纠错：后端 analyzeHeartSign 会把同类内容优先分到用户改后的类别
      base44.functions.invoke('recordHeartSignCorrection', {
        note_id: note.id,
        from_type: prevType,
        to_type: newType,
        text: notePlainText(note).slice(0, 200),
      }).catch(() => {});
    }).catch(() => {
      queryClient.setQueryData(['notes'], (old) =>
        (old || []).map(n => (n.id === note.id ? {
          ...n,
          source_type: prevType,
          ai_analysis: { ...(n.ai_analysis || {}), category: prevLabel },
          metadata: { ...(n.metadata || {}), ai_analysis: { ...(n.metadata?.ai_analysis || {}), category: prevLabel } },
        } : n)));
      toast.error('分类更新失败，已恢复原分类');
    });
  };

  const handleVaultRequest = (note) => {
    if (!isStandaloneMode) {
      toast.error('当前环境不支持保险柜');
      return;
    }
    setVaultInitialValue(note?.plain_text || null);
    setVaultOpen(true);
  };

  // 回顾定位：重置过滤 → 闪动高亮 → 滚动到目标签卡
  const handleLocate = (id) => {
    setReviewOpen(false);
    setCategoryFilter('all');
    setFlashId(id);
    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-hs-id="${id}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    setTimeout(() => setFlashId(null), 2400);
  };

  // 回应浓度切换：持久化到 localStorage，后端 analyzeHeartSign / followupHeartSign 读取同一键
  const handleDensityChange = (value) => {
    setDensity(value);
    localStorage.setItem(DENSITY_KEY, value);
    toast.success(value === 'mute' ? '好，我只收不答，静静陪着你'
      : value === 'light' ? '好，我轻轻回应就好' : '好，我会多陪你说说');
  };

  // Get all unique tags
  const allTags = useMemo(() => {
    const tagSet = new Set();
    notes.forEach(note => {
      if (note.tags && Array.isArray(note.tags)) {
        note.tags.forEach(tag => tagSet.add(tag));
      }
    });
    return Array.from(tagSet).sort();
  }, [notes]);

  // Enhanced Filter and Sort
  const filteredNotes = useMemo(() => {
    let result = notes.filter((note) => !note.deleted_at);

    // 只显示用户自建内容（过滤掉外部信息）
    if (onlyMine) {
      result = result.filter((note) => !EXTERNAL_SOURCES.includes(note.source_type));
    }

    // 五类签过滤 / 已置顶（与小程序口径一致：source_type 优先，回落 ai 分类）
    if (categoryFilter === 'pinned') {
      result = result.filter((note) => isPinnedNote(note) || note.is_pinned === true);
    } else if (categoryFilter !== 'all') {
      result = result.filter((note) => getNoteType(note) === categoryFilter);
    }

    // Full-text search (content + tags)
    // 打码：保险柜内容不参与关键词检索——避免用关键词探测敏感签文的存在
    if (searchQuery) {
      const lowerQuery = searchQuery.toLowerCase();
      result = result.filter((note) =>
        !isVaultNote(note) && (
        (note.plain_text && note.plain_text.toLowerCase().includes(lowerQuery)) ||
        (note.content && note.content.toLowerCase().includes(lowerQuery)) ||
        (note.tags && note.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))))
      );
    }

    // Tag filter
    if (filters.tags && filters.tags.length > 0) {
      result = result.filter((note) =>
        note.tags && filters.tags.some(filterTag => note.tags.includes(filterTag))
      );
    }

    // Pinned filter
    if (filters.pinnedOnly === true) {
      result = result.filter((note) => note.is_pinned === true || isPinnedNote(note));
    }

    // Date range filter
    if (filters.dateRange?.from) {
      const fromDate = new Date(filters.dateRange.from);
      fromDate.setHours(0, 0, 0, 0);

      result = result.filter((note) => {
        const noteDate = new Date(note.created_date);
        noteDate.setHours(0, 0, 0, 0);

        if (filters.dateRange.to) {
          const toDate = new Date(filters.dateRange.to);
          toDate.setHours(23, 59, 59, 999);
          return noteDate >= fromDate && noteDate <= toDate;
        }
        return noteDate >= fromDate;
      });
    }

    // Sort: Pinned first, then by date
    return result.sort((a, b) => {
      const pa = isPinnedNote(a) || a.is_pinned === true;
      const pb = isPinnedNote(b) || b.is_pinned === true;
      if (pa && !pb) return -1;
      if (!pa && pb) return 1;
      return new Date(b.created_date) - new Date(a.created_date);
    });
  }, [notes, searchQuery, filters, onlyMine, categoryFilter]);

  // 更新心签活动时间
  const handleUpdateActivity = (note) => {
    if (note.is_burn_after_reading) {
      base44.entities.Note.update(note.id, {
        last_active_at: new Date().toISOString()
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['notes'] });
      });
    }
  };

  return (
    <div className="p-4 md:p-8 space-y-6 max-w-7xl mx-auto min-h-screen">
      {/* Header Row1：品牌 + 搜索 + 心签/知识库切换 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center gap-2.5 md:gap-3">

        <div className="flex items-center gap-2.5 flex-shrink-0">
          <div className="h-9 w-9 md:h-10 md:w-10 rounded-lg md:rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
            <StickyNote className="w-4 h-4 md:w-6 md:h-6 text-white" />
          </div>
          <div className="hidden sm:block leading-tight">
            <h1 className="text-lg md:text-2xl font-bold text-slate-800">
              <AIText>灵感心签</AIText>
            </h1>
            <p className="text-[11px] md:text-xs text-slate-500"><AIText>说给另一个自己听</AIText></p>
          </div>
        </div>

        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="搜索你记过的任何东西…"
            className="pl-9 pr-8 h-9 md:h-10 text-sm bg-white border-slate-200 rounded-xl focus:ring-2 focus:ring-[#384877]/20"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
            >
              <span className="text-xs">✕</span>
            </button>
          )}
        </div>

        {/* 心签 / 知识库 分段切换 */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 flex-shrink-0 shadow-sm">
          {[
            { key: "notes", label: "心签", icon: StickyNote },
            { key: "knowledge", label: "知识库", icon: Brain },
          ].map((t) => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              className={`flex items-center gap-1.5 px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm transition-colors ${
                activeTab === t.key
                  ? "bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <t.icon className="w-3.5 h-3.5 md:w-4 md:h-4" />
              <span className="hidden md:inline">{t.label}</span>
            </button>
          ))}
        </div>
      </motion.div>

      {activeTab === "notes" && (
        <>
          {/* 五类过滤（含账本签）+ 回应浓度 + 手账/回顾/保险柜 */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="flex items-center gap-2 flex-wrap"
          >
            <div className="flex-1 min-w-[260px]">
              <CategoryFilterBar
                notes={notes.filter((n) => !n.deleted_at)}
                filter={categoryFilter}
                onFilterChange={setCategoryFilter}
              />
            </div>
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <span className="hidden sm:inline">回应</span>
                <select
                  value={density}
                  onChange={(e) => handleDensityChange(e.target.value)}
                  title="回应浓度：AI 回应你的方式"
                  className="bg-white border border-slate-200 rounded-full px-2.5 py-1.5 text-xs text-slate-600 outline-none focus:border-[#384877]/50"
                >
                  {DENSITY_OPTIONS.map((o) => (
                    <option key={o.key} value={o.key}>{o.label}</option>
                  ))}
                </select>
              </div>
              <Button
                onClick={() => setJournalOpen(true)}
                variant="outline"
                size="sm"
                title="心签手账：近 7 天的记录与情绪晴雨"
                className="h-8 px-2.5 gap-1.5 border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">手账</span>
              </Button>
              <Button
                onClick={() => setReviewOpen(true)}
                variant="outline"
                size="sm"
                title="抽一签 / 按词回顾，与过去的自己重逢"
                className="h-8 px-2.5 gap-1.5 border-[#384877]/30 bg-[#384877]/5 hover:bg-[#384877]/10 text-[#384877] text-xs"
              >
                <Dices className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">回顾</span>
              </Button>
              <Button
                onClick={() => handleVaultRequest(null)}
                variant="outline"
                size="sm"
                title="保险柜：密码保护的私密信息，AI 不会阅读"
                className="h-8 px-2.5 gap-1.5 border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs"
              >
                <Lock className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">保险柜</span>
              </Button>
            </div>
          </motion.div>

          {/* Filters */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.05 }}
            className="flex items-center justify-between gap-2 md:gap-3 flex-wrap"
          >
            <NoteFilters
              filters={filters}
              onFiltersChange={setFilters}
              allTags={allTags}
              onCategorySelect={setCategoryFilter}
              activeCategory={categoryFilter}
            />

            <div className="flex items-center gap-1.5 md:gap-3">
              <Button
                onClick={() => setOnlyMine((v) => !v)}
                variant="outline"
                size="sm"
                title={onlyMine ? '当前只显示我自建的内容，点击显示全部' : '只显示我自建的内容，隐藏外部信息'}
                className={`h-7 md:h-8 px-2 md:px-3 gap-1 md:gap-1.5 text-xs md:text-sm ${
                  onlyMine
                    ? 'border-transparent bg-[#384877] hover:bg-[#2f3d63] text-white'
                    : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-700'
                }`}
              >
                <User className="w-3 h-3 md:w-3.5 md:h-3.5" />
                <span className="hidden sm:inline">{onlyMine ? '仅我的内容' : '全部内容'}</span>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    title="AI 工具：问答 / 智能整理 / 扩展视野"
                    className="h-7 md:h-8 px-2 md:px-3 gap-1 md:gap-1.5 border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs md:text-sm"
                  >
                    <Wand2 className="w-3 h-3 md:w-3.5 md:h-3.5" />
                    <span className="hidden sm:inline">工具</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => setShowKnowledgeBase(true)}>
                    <Brain className="w-3.5 h-3.5 mr-2 text-blue-600" />
                    AI 问答
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setShowAIOrganizer(true)}>
                    <Wand2 className="w-3.5 h-3.5 mr-2 text-purple-600" />
                    智能整理
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setShowExternalHorizon(true)}>
                    <Globe className="w-3.5 h-3.5 mr-2 text-violet-600" />
                    扩展视野
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <div className="text-xs md:text-sm text-slate-500 whitespace-nowrap">
                <span className="font-semibold text-[#384877]">{filteredNotes.length}</span>
                <span className="hidden md:inline"> 条心签</span>
              </div>
            </div>
          </motion.div>

          {/* 签列表（与小程序一致：无底部大输入框，每条内容一张签，整页滚动） */}
          <div className="hs-page max-w-3xl mx-auto space-y-3 pb-6">
            {/* 输入入口：点开弹出完整输入面板 */}
            <button
              onClick={() => setComposerOpen(true)}
              className="hs-card w-full flex items-center gap-2.5 text-left text-sm text-slate-400 hover:text-slate-500 transition-colors"
            >
              <PenLine className="w-4 h-4 text-[#384877]/60 flex-shrink-0" />
              说给另一个自己听……
              <Send className="w-4 h-4 ml-auto text-[#384877]/40 flex-shrink-0" />
            </button>

            {filteredNotes.length === 0 ? (
              <div className="text-center py-16 max-w-md mx-auto">
                <div className="w-16 h-16 bg-[#384877]/8 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="text-2xl text-[#384877] font-serif">签</span>
                </div>
                <h3 className="text-slate-800 font-medium mb-2"><AIText>这里还空着</AIText></h3>
                <p className="text-slate-500 text-sm"><AIText>此刻的心情、刷到的好文章、怕忘的号码……都可以丢进来</AIText></p>
              </div>
            ) : (
              filteredNotes.map((note) => (
                <div key={note.id} onClick={() => setEditingNote(note)} className="cursor-pointer">
                  <HeartSignMessage
                    note={note}
                    flash={flashId === note.id}
                    onDeleted={(id) => deleteNoteMutation.mutate(id)}
                    onRestore={() => queryClient.invalidateQueries({ queryKey: ['notes'] })}
                    onTypeChange={handleTypeChange}
                    onVaultRequest={handleVaultRequest}
                    onPinnedChange={handlePinnedChange}
                    onConvertToTask={handleSmartConvertToTask}
                    onSaveToKnowledge={(n) => saveToKnowledgeMutation.mutate(n)}
                  />
                </div>
              ))
            )}
          </div>
        </>
      )}

      {activeTab === "knowledge" && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0 }}
        >
          <KnowledgeBaseManager />
        </motion.div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingNote} onOpenChange={(open) => !open && setEditingNote(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] w-[95vw] md:w-auto overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg md:text-xl">编辑心签</DialogTitle>
          </DialogHeader>
          {editingNote && (
            <div className="space-y-6">
              <NoteEditor
                initialData={editingNote}
                onSave={(data) => updateNoteMutation.mutate({ id: editingNote.id, data })}
                onClose={() => setEditingNote(null)}
              />

              {/* Comments Section */}
              <div className="pt-6 border-t border-slate-200">
                <NoteComments noteId={editingNote.id} />
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Share Dialog */}
      <NoteShareDialog
        note={sharingNote}
        open={!!sharingNote}
        onOpenChange={(open) => !open && setSharingNote(null)}
      />

      {/* AI Organizer */}
      <AINotesOrganizer
        notes={notes}
        open={showAIOrganizer}
        onOpenChange={setShowAIOrganizer}
      />

      {/* External Horizon - 外部视野面板 */}
      <ExternalHorizonPanel
        open={showExternalHorizon}
        onOpenChange={setShowExternalHorizon}
        notes={filteredNotes}
      />

      {/* AI Knowledge Base */}
      <Dialog open={showKnowledgeBase} onOpenChange={setShowKnowledgeBase}>
        <DialogContent className="max-w-3xl w-[95vw] md:w-auto h-[85vh] md:h-[80vh] p-0">
          <AIKnowledgeBase open={showKnowledgeBase} onOpenChange={setShowKnowledgeBase} />
        </DialogContent>
      </Dialog>

      {/* 回顾：抽一签 / 按词回顾 */}
      <ReviewDialog
        open={reviewOpen}
        onOpenChange={setReviewOpen}
        notes={notes.filter((n) => !n.deleted_at)}
        onLocate={handleLocate}
      />

      {/* 输入面板：完整输入能力（模板/附件/图片/链接/语音）集中在弹窗中 */}
      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent className="max-w-2xl w-[95vw] md:w-auto p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-5 pt-4 pb-1">
            <DialogTitle className="text-base">说给另一个自己听</DialogTitle>
          </DialogHeader>
          <HeartSignInput
            onSend={async (payload) => {
              await handleSend(payload);
              setComposerOpen(false);
            }}
          />
        </DialogContent>
      </Dialog>

      {/* 手账：近 7 天统计与情绪晴雨 */}
      <JournalDialog
        open={journalOpen}
        onOpenChange={setJournalOpen}
        notes={notes.filter((n) => !n.deleted_at)}
      />

      {/* 保险柜 */}
      <VaultDialog
        open={vaultOpen}
        onOpenChange={(open) => {
          setVaultOpen(open);
          if (!open) setVaultInitialValue(null);
        }}
        initialValue={vaultInitialValue}
        onVaulted={() => queryClient.invalidateQueries({ queryKey: ['notes'] })}
      />

      {/* Create Task Dialog */}
      <Dialog open={!!taskCreationNote} onOpenChange={(open) => !open && setTaskCreationNote(null)}>
        <DialogContent className="max-w-2xl w-[95vw] md:w-auto max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base md:text-lg">
                <CalendarIcon className="w-4 h-4 md:w-5 md:h-5 text-blue-600" />
                从心签创建约定
            </DialogTitle>
          </DialogHeader>
          {taskCreationNote &&
          <QuickAddTask
            initialData={
              taskCreationNote.smartData ? {
                  ...taskCreationNote.smartData,
                  reminder_time: taskCreationNote.smartData.reminder_time || new Date().toISOString()
              } : {
                  title: taskCreationNote.ai_analysis?.summary || taskCreationNote.plain_text?.slice(0, 50) || "新约定",
                  description: taskCreationNote.ai_analysis?.key_points ?
                  `要点总结：\n- ${taskCreationNote.ai_analysis.key_points.join('\n- ')}\n\n原文内容：\n${taskCreationNote.plain_text || ""}` :
                  taskCreationNote.plain_text || ""
              }
            }
            onAdd={(taskData) => {
              // Ensure reminder_time is set if QuickAddTask doesn't enforce it strictly or if user didn't change it
              const dataToSubmit = {
                ...taskData,
                reminder_time: taskData.reminder_time || new Date().toISOString(),
                __noteId: taskCreationNote?.id
              };
              createTaskMutation.mutate(dataToSubmit);
            }} />

          }
        </DialogContent>
      </Dialog>

      {/* Mobile Quick Input */}
      <AnimatePresence>
        {showMobileInput && (
          <MobileVoiceNoteInput
            onSave={(data) => {
              createNoteMutation.mutate(data);
              setShowMobileInput(false);
            }}
            onClose={() => setShowMobileInput(false)}
          />
        )}
      </AnimatePresence>

      {/* 右下角 +：与小程序一致的快捷记录入口（桌面/移动端通用） */}
      {activeTab === "notes" && (
        <motion.button
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setComposerOpen(true)}
          className="fixed bottom-20 right-4 z-40 h-14 w-14 rounded-full bg-gradient-to-br from-[#384877] to-[#3b5aa2] text-white shadow-2xl shadow-[#384877]/40 flex items-center justify-center active:shadow-lg transition-shadow"
        >
          <Plus className="w-7 h-7" strokeWidth={2.5} />
        </motion.button>
      )}
    </div>);

}
