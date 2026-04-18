import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { base44 } from "@/api/base44Client";
import { Plus, X, MapPin, User, Loader2, Sparkles } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "@/components/ui/use-toast";

const MEMORY_TYPES = [
  { value: "work", label: "工作" },
  { value: "social", label: "人际" },
  { value: "personal", label: "个人" },
  { value: "health", label: "健康" },
  { value: "study", label: "学习" },
  { value: "family", label: "家庭" },
];

const EMOTIONS = [
  { value: "positive", label: "⭐ 积极" },
  { value: "warm", label: "💗 温暖" },
  { value: "neutral", label: "— 平和" },
  { value: "anxious", label: "⚠ 焦虑" },
  { value: "negative", label: "👎 低落" },
];

export default function AddMemoryDialog({ open, onOpenChange, relationships }) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [form, setForm] = useState({
    title: "", content: "", memory_type: "personal", emotion: "neutral",
    event_date: new Date().toISOString().slice(0, 16),
    people: [], locations: [], tags: [],
  });
  const [personInput, setPersonInput] = useState("");
  const [locationInput, setLocationInput] = useState("");
  const [tagInput, setTagInput] = useState("");

  const addPerson = () => {
    if (!personInput.trim()) return;
    setForm(f => ({ ...f, people: [...f.people, { name: personInput.trim(), role: "" }] }));
    setPersonInput("");
  };

  const addLocation = () => {
    if (!locationInput.trim()) return;
    setForm(f => ({ ...f, locations: [...f.locations, { name: locationInput.trim(), type: "other" }] }));
    setLocationInput("");
  };

  const addTag = () => {
    if (!tagInput.trim()) return;
    setForm(f => ({ ...f, tags: [...f.tags, tagInput.trim()] }));
    setTagInput("");
  };

  const handleAIEnhance = async () => {
    if (!form.content && !form.title) return;
    setAiLoading(true);
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: `分析这条记忆并提取关键信息：
标题：${form.title}
内容：${form.content}

返回JSON格式的洞察分析。`,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            suggestion: { type: "string" },
            context_note: { type: "string" },
            suggested_tags: { type: "array", items: { type: "string" } },
          }
        }
      });
      setForm(f => ({
        ...f,
        ai_insight: { summary: result.summary, suggestion: result.suggestion, context_note: result.context_note },
        tags: [...new Set([...f.tags, ...(result.suggested_tags || [])])],
      }));
      toast({ title: "AI分析完成" });
    } catch (e) {
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title) return;
    setSaving(true);
    try {
      await base44.entities.MemoryRecord.create({
        ...form,
        event_date: new Date(form.event_date).toISOString(),
      });
      queryClient.invalidateQueries({ queryKey: ["memories"] });
      toast({ title: "记忆已保存" });
      onOpenChange(false);
      setForm({ title: "", content: "", memory_type: "personal", emotion: "neutral", event_date: new Date().toISOString().slice(0, 16), people: [], locations: [], tags: [] });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>记录新记忆</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <Input placeholder="记忆标题" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
          <Textarea placeholder="详细描述..." value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))} rows={3} />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">记忆类型</label>
              <Select value={form.memory_type} onValueChange={v => setForm(f => ({ ...f, memory_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {MEMORY_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">情感</label>
              <Select value={form.emotion} onValueChange={v => setForm(f => ({ ...f, emotion: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {EMOTIONS.map(e => <SelectItem key={e.value} value={e.value}>{e.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="text-xs text-slate-500 mb-1 block">事件日期</label>
            <Input type="datetime-local" value={form.event_date} onChange={e => setForm(f => ({ ...f, event_date: e.target.value }))} />
          </div>

          {/* People */}
          <div>
            <label className="text-xs text-slate-500 mb-1 flex items-center gap-1"><User className="w-3 h-3" /> 关联人物</label>
            <div className="flex gap-2">
              <Input placeholder="姓名" value={personInput} onChange={e => setPersonInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addPerson())} />
              <Button size="sm" variant="outline" onClick={addPerson}><Plus className="w-4 h-4" /></Button>
            </div>
            {form.people.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.people.map((p, i) => (
                  <Badge key={i} className="bg-blue-50 text-blue-600 border-0">
                    {p.name}
                    <button onClick={() => setForm(f => ({ ...f, people: f.people.filter((_, j) => j !== i) }))} className="ml-1"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Locations */}
          <div>
            <label className="text-xs text-slate-500 mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> 关联地点</label>
            <div className="flex gap-2">
              <Input placeholder="地点名" value={locationInput} onChange={e => setLocationInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addLocation())} />
              <Button size="sm" variant="outline" onClick={addLocation}><Plus className="w-4 h-4" /></Button>
            </div>
            {form.locations.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.locations.map((l, i) => (
                  <Badge key={i} className="bg-emerald-50 text-emerald-600 border-0">
                    <MapPin className="w-3 h-3 mr-0.5" />{l.name}
                    <button onClick={() => setForm(f => ({ ...f, locations: f.locations.filter((_, j) => j !== i) }))} className="ml-1"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div>
            <label className="text-xs text-slate-500 mb-1 block">标签</label>
            <div className="flex gap-2">
              <Input placeholder="添加标签" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())} />
              <Button size="sm" variant="outline" onClick={addTag}><Plus className="w-4 h-4" /></Button>
            </div>
            {form.tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {form.tags.map((t, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {t}
                    <button onClick={() => setForm(f => ({ ...f, tags: f.tags.filter((_, j) => j !== i) }))} className="ml-1"><X className="w-3 h-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="outline" onClick={handleAIEnhance} disabled={aiLoading} className="flex-1">
              {aiLoading ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Sparkles className="w-4 h-4 mr-1" />}
              AI 分析
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.title} className="flex-1 bg-[#384877] hover:bg-[#2c3a63]">
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
              保存记忆
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}