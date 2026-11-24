import React, { useEffect, useState } from "react";
import { CalendarCheck, Globe2, Loader2, MessageCircle, Plus, Sparkles, Trash2, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const COLLAB_LANGUAGE_OPTIONS = [
  { key: "auto", label: "自动跟随成员" },
  { key: "zh", label: "中文" },
  { key: "en", label: "English" },
  { key: "ja", label: "日本語" },
  { key: "es", label: "Español" },
  { key: "fr", label: "Français" },
];

const WEEKDAY_LABELS = ["", "一", "二", "三", "四", "五", "六", "日"];

const DEFAULT_SETTINGS = {
  language: "auto",
  welcome: { enabled: false, template: "" },
  checkinDigest: { enabled: false, time: "21:00", mentionMissing: true },
  customRules: [],
};

function normalize(agentMeta) {
  const settings = agentMeta?.settings || {};
  return {
    language: COLLAB_LANGUAGE_OPTIONS.some((item) => item.key === settings.language)
      ? settings.language
      : DEFAULT_SETTINGS.language,
    welcome: {
      enabled: settings.welcome?.enabled === true,
      template: typeof settings.welcome?.template === "string" ? settings.welcome.template : "",
    },
    checkinDigest: {
      enabled: settings.checkinDigest?.enabled === true,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(settings.checkinDigest?.time || ""))
        ? settings.checkinDigest.time
        : DEFAULT_SETTINGS.checkinDigest.time,
      mentionMissing: settings.checkinDigest?.mentionMissing !== false,
    },
    customRules: (Array.isArray(settings.customRules) ? settings.customRules : [])
      .filter((rule) => rule && String(rule.instruction || "").trim())
      .map((rule) => ({ ...rule, enabled: rule.enabled !== false }))
      .slice(0, 10),
  };
}

function scheduleLabel(rule) {
  if (!rule || rule.mode === "instruction") return "对话时";
  if (rule.frequency === "weekly") return `每周${WEEKDAY_LABELS[rule.weekday] || "一"} ${rule.time}`;
  if (rule.frequency === "monthly") return `每月${rule.day || 1}日 ${rule.time}`;
  return `每天 ${rule.time || "09:00"}`;
}

function Section({ icon: Icon, title, children }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-[#FAF9F7] p-3.5">
      <div className="flex items-center gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-[#384877]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="text-[12px] font-semibold text-stone-800">{title}</div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * 协同空间 Agent 自定义：欢迎语、打卡公布、语言，以及自然语言添加的更多群管理功能。
 * 只有空间发起人可以修改；规则在保存后生效。
 */
export default function CollabAutomationSettings({ open, onOpenChange, taskId, agentMeta, canEdit = false, onSaved }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [ruleInput, setRuleInput] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setSettings(normalize(agentMeta));
      setRuleInput("");
    }
  }, [open, agentMeta]);

  const updateWelcome = (patch) => setSettings((current) => ({ ...current, welcome: { ...current.welcome, ...patch } }));
  const updateDigest = (patch) => setSettings((current) => ({ ...current, checkinDigest: { ...current.checkinDigest, ...patch } }));
  const updateRule = (id, patch) =>
    setSettings((current) => ({
      ...current,
      customRules: current.customRules.map((rule) => (rule.id === id ? { ...rule, ...patch } : rule)),
    }));
  const removeRule = (id) =>
    setSettings((current) => ({ ...current, customRules: current.customRules.filter((rule) => rule.id !== id) }));

  const addRule = async () => {
    const text = ruleInput.trim();
    if (!text || parsing || !canEdit) return;
    if (settings.customRules.length >= 10) {
      toast.info("最多添加 10 个自定义功能");
      return;
    }
    setParsing(true);
    try {
      const result = await httpRequest(`/api/collab/${taskId}/agent-rules/parse`, {
        method: "POST",
        body: { text },
      });
      if (!result?.rule) throw new Error("empty rule");
      setSettings((current) => ({ ...current, customRules: [...current.customRules, result.rule].slice(0, 10) }));
      setRuleInput("");
      toast.success("已添加，保存后生效");
    } catch (error) {
      toast.error(error?.data?.message || error?.message || "这句话还没法变成一条功能，换个说法试试");
    } finally {
      setParsing(false);
    }
  };

  const save = async () => {
    if (!taskId || saving || !canEdit) return;
    setSaving(true);
    try {
      await httpRequest(`/api/collab/${taskId}/agent-settings`, {
        method: "PATCH",
        body: {
          language: settings.language,
          welcome: { enabled: settings.welcome.enabled, template: settings.welcome.template.trim() },
          checkinDigest: {
            enabled: settings.checkinDigest.enabled,
            time: settings.checkinDigest.time,
            mentionMissing: settings.checkinDigest.mentionMissing,
          },
          customRules: settings.customRules,
        },
      });
      toast.success("Agent 设置已保存");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error?.data?.message || error?.message || "保存失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-[480px] overflow-y-auto rounded-2xl p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px] text-stone-900">
            <Sparkles className="h-4 w-4 text-[#384877]" /> 自定义心栈 Agent
          </DialogTitle>
        </DialogHeader>

        {!canEdit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
            只有协同发起人可以修改。
          </div>
        )}

        <div className="space-y-3">
          <Section icon={MessageCircle} title="入群欢迎语">
            <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="text-[11px] text-stone-700">发送入群欢迎</span>
              <Switch
                checked={settings.welcome.enabled}
                onCheckedChange={(checked) => updateWelcome({ enabled: checked })}
                disabled={!canEdit}
                className="data-[state=checked]:bg-[#384877]"
              />
            </div>
            <textarea
              value={settings.welcome.template}
              onChange={(event) => updateWelcome({ template: event.target.value.slice(0, 800) })}
              disabled={!canEdit || !settings.welcome.enabled}
              rows={3}
              placeholder="自定义欢迎语"
              className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
            />
          </Section>

          <Section icon={CalendarCheck} title="每日打卡公布">
            <div className="flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="text-[11px] text-stone-700">开启每日打卡公布</span>
              <Switch
                checked={settings.checkinDigest.enabled}
                onCheckedChange={(checked) => updateDigest({ enabled: checked })}
                disabled={!canEdit}
                className="data-[state=checked]:bg-[#384877]"
              />
            </div>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="text-[11px] text-stone-700">公布时间</span>
              <input
                type="time"
                value={settings.checkinDigest.time}
                onChange={(event) => updateDigest({ time: event.target.value || "21:00" })}
                disabled={!canEdit || !settings.checkinDigest.enabled}
                className="h-8 rounded-md border border-stone-200 bg-white px-2 text-[11px] text-stone-700 focus:border-stone-400 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
              />
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="text-[11px] text-stone-700">点名未打卡成员</span>
              <Switch
                checked={settings.checkinDigest.mentionMissing}
                onCheckedChange={(checked) => updateDigest({ mentionMissing: checked })}
                disabled={!canEdit || !settings.checkinDigest.enabled}
                className="data-[state=checked]:bg-[#384877]"
              />
            </div>
          </Section>

          <Section icon={Globe2} title="沟通语言">
            <select
              value={settings.language}
              onChange={(event) => setSettings((current) => ({ ...current, language: event.target.value }))}
              disabled={!canEdit}
              className="h-9 w-full rounded-lg border border-stone-200 bg-white px-3 text-[11px] text-stone-700 focus:border-stone-400 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
            >
              {COLLAB_LANGUAGE_OPTIONS.map((item) => (
                <option key={item.key} value={item.key}>{item.label}</option>
              ))}
            </select>
          </Section>

          <Section icon={Wand2} title="自定义功能">
            <div className="flex items-end gap-2">
              <textarea
                value={ruleInput}
                onChange={(event) => setRuleInput(event.target.value.slice(0, 600))}
                disabled={!canEdit}
                rows={2}
                placeholder="例如：每周一早上 9 点提醒大家本周目标"
                className="min-w-0 flex-1 resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
              />
              <Button
                type="button"
                onClick={addRule}
                disabled={!canEdit || parsing || !ruleInput.trim()}
                className="min-h-[36px] shrink-0 text-[11px] text-white"
                style={{ backgroundColor: "#384877" }}
              >
                {parsing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                添加
              </Button>
            </div>
            {settings.customRules.length > 0 && (
              <div className="mt-2 space-y-1.5">
                {settings.customRules.map((rule) => (
                  <div key={rule.id} className="flex items-center gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[11px] font-medium text-stone-800">{rule.name}</div>
                      <div className="mt-0.5 truncate text-[9px] text-stone-400">
                        {scheduleLabel(rule)}
                        {rule.condition ? ` · ${rule.condition}` : ""}
                      </div>
                    </div>
                    <Switch
                      checked={rule.enabled !== false}
                      onCheckedChange={(checked) => updateRule(rule.id, { enabled: checked })}
                      disabled={!canEdit}
                      className="data-[state=checked]:bg-[#384877]"
                    />
                    <button
                      type="button"
                      onClick={() => removeRule(rule.id)}
                      disabled={!canEdit}
                      className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-red-500 disabled:opacity-40"
                      aria-label="删除功能"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <DialogFooter className="mt-1 gap-2 sm:gap-0">
          <Button type="button" variant="outline" className="min-h-[38px] text-xs" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          {canEdit && (
            <Button
              type="button"
              onClick={save}
              disabled={saving}
              className="min-h-[38px] text-xs text-white"
              style={{ backgroundColor: "#384877" }}
            >
              {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              保存设置
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
