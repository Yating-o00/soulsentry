import React, { useEffect, useState } from "react";
import { CalendarCheck, Globe2, Loader2, MessageCircle, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { httpRequest } from "@/api/httpClient";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export const COLLAB_LANGUAGE_OPTIONS = [
  { key: "auto", label: "自动跟随成员" },
  { key: "zh", label: "中文" },
  { key: "en", label: "English" },
  { key: "ja", label: "日本語" },
  { key: "es", label: "Español" },
  { key: "fr", label: "Français" },
];

const DEFAULT_SETTINGS = {
  language: "auto",
  welcome: { enabled: false, template: "" },
  checkinDigest: { enabled: false, time: "21:00", mentionMissing: true },
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
  };
}

function Section({ icon: Icon, title, description, children }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-[#FAF9F7] p-3.5">
      <div className="flex items-start gap-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#eef2ff] text-[#384877]">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <div className="min-w-0">
          <div className="text-[12px] font-semibold text-stone-800">{title}</div>
          {description && <p className="mt-0.5 text-[10px] leading-relaxed text-stone-400">{description}</p>}
        </div>
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/**
 * 协同空间 Agent 自动化设置：入群欢迎、每日打卡公布、沟通语言。
 * 只有空间发起人可以修改；其他成员可以打开查看当前配置。
 */
export default function CollabAutomationSettings({ open, onOpenChange, taskId, agentMeta, canEdit = false, onSaved }) {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setSettings(normalize(agentMeta));
  }, [open, agentMeta]);

  const updateWelcome = (patch) => setSettings((current) => ({ ...current, welcome: { ...current.welcome, ...patch } }));
  const updateDigest = (patch) => setSettings((current) => ({ ...current, checkinDigest: { ...current.checkinDigest, ...patch } }));

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
        },
      });
      toast.success("Agent 自动化设置已保存");
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
          <DialogDescription className="text-[11px] leading-relaxed text-stone-500">
            让 Agent 在协同空间里承担欢迎成员、公布打卡和语言沟通等固定工作。仅使用本空间数据，不消耗 AI 点数。
          </DialogDescription>
        </DialogHeader>

        {!canEdit && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
            只有协同发起人可以修改自动化设置；你可以查看当前配置。
          </div>
        )}

        <div className="space-y-3">
          <Section
            icon={MessageCircle}
            title="入群欢迎语"
            description="每个成员第一次进入协同空间时，由 Agent 在讨论里欢迎 TA。"
          >
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
              placeholder="留空使用默认欢迎语。可用变量：{name}、{task}、{goal}、{members}"
              className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
            />
            <p className="mt-1 text-[9px] leading-relaxed text-stone-400">
              默认：欢迎 @名字 来到「空间」，这里的共同目标是……；会自动 @ 新成员并发送通知。
            </p>
          </Section>

          <Section
            icon={CalendarCheck}
            title="每日打卡公布"
            description="每天按设定时间整理成员打卡，并发到讨论的「打卡日报」主题。"
          >
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
              <span className="text-[11px] text-stone-700">公布时间（北京时间）</span>
              <input
                type="time"
                value={settings.checkinDigest.time}
                onChange={(event) => updateDigest({ time: event.target.value || "21:00" })}
                disabled={!canEdit || !settings.checkinDigest.enabled}
                className="h-8 rounded-md border border-stone-200 bg-white px-2 text-[11px] text-stone-700 focus:border-stone-400 focus:outline-none disabled:bg-stone-50 disabled:text-stone-400"
              />
            </div>
            <div className="mt-2 flex items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2">
              <span className="text-[11px] text-stone-700">点名还没打卡的成员</span>
              <Switch
                checked={settings.checkinDigest.mentionMissing}
                onCheckedChange={(checked) => updateDigest({ mentionMissing: checked })}
                disabled={!canEdit || !settings.checkinDigest.enabled}
                className="data-[state=checked]:bg-[#384877]"
              />
            </div>
            <p className="mt-1 text-[9px] leading-relaxed text-stone-400">
              只对包含打卡约定的协同空间生效；当天没有打卡记录时也会公布一次。
            </p>
          </Section>

          <Section
            icon={Globe2}
            title="沟通语言"
            description="Agent 的回复、整理和群发消息使用的语言。"
          >
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
            <p className="mt-1 text-[9px] leading-relaxed text-stone-400">
              「自动」会跟随成员每条消息使用的语言；固定语言适合跨语言协作的群。
            </p>
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
