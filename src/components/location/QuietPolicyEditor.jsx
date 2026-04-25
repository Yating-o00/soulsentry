import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BellOff, Info } from 'lucide-react';

export const DEFAULT_QUIET_POLICY = {
  merge_mode: 'merge',
  cooldown_minutes: 30,
  merge_window_minutes: 10,
  max_per_day: 5,
  min_dwell_seconds: 60,
  quiet_hours_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00'
};

const MERGE_MODE_HINT = {
  none: '每次进出都立即推送（最吵）',
  merge: '窗口期内多次触发合并为一条通知（推荐）',
  first_only: '冷却期内仅推送首次触发，后续抑制',
  last_only: '冷却期内仅保留最近一次，覆盖之前的合并消息'
};

/**
 * 紧凑的「通知静默策略」编辑器：
 * - 合并模式 / 冷却 / 合并窗口 / 每日上限 / 最小停留
 * - 免打扰时段
 */
export default function QuietPolicyEditor({ value, onChange }) {
  const policy = { ...DEFAULT_QUIET_POLICY, ...(value || {}) };
  const set = (patch) => onChange({ ...policy, ...patch });

  return (
    <div className="rounded-xl border border-amber-100 bg-gradient-to-br from-amber-50/60 to-orange-50/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center flex-shrink-0">
          <BellOff className="w-3.5 h-3.5 text-white" />
        </div>
        <div className="min-w-0">
          <div className="text-xs font-semibold text-slate-800">通知静默策略</div>
          <div className="text-[10px] text-slate-500">减少频繁进出该区域时的无效轰炸</div>
        </div>
      </div>

      <div>
        <Label className="text-xs">合并模式</Label>
        <Select value={policy.merge_mode} onValueChange={(v) => set({ merge_mode: v })}>
          <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">不合并 · 立即推送</SelectItem>
            <SelectItem value="merge">合并多条（推荐）</SelectItem>
            <SelectItem value="first_only">仅首次</SelectItem>
            <SelectItem value="last_only">仅最近</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-[10px] text-slate-500 mt-1 flex items-start gap-1">
          <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
          {MERGE_MODE_HINT[policy.merge_mode]}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label className="text-xs">冷却（分钟）</Label>
          <Input
            type="number"
            min="0"
            value={policy.cooldown_minutes}
            onChange={(e) => set({ cooldown_minutes: parseInt(e.target.value) || 0 })}
            className="mt-1 h-9"
          />
        </div>
        <div>
          <Label className="text-xs">合并窗口（分钟）</Label>
          <Input
            type="number"
            min="0"
            value={policy.merge_window_minutes}
            onChange={(e) => set({ merge_window_minutes: parseInt(e.target.value) || 0 })}
            className="mt-1 h-9"
            disabled={policy.merge_mode === 'none'}
          />
        </div>
        <div>
          <Label className="text-xs">每日上限</Label>
          <Input
            type="number"
            min="0"
            value={policy.max_per_day}
            onChange={(e) => set({ max_per_day: parseInt(e.target.value) || 0 })}
            className="mt-1 h-9"
          />
        </div>
        <div>
          <Label className="text-xs">最小停留（秒）</Label>
          <Input
            type="number"
            min="0"
            value={policy.min_dwell_seconds}
            onChange={(e) => set({ min_dwell_seconds: parseInt(e.target.value) || 0 })}
            className="mt-1 h-9"
          />
        </div>
      </div>

      <div className="rounded-lg bg-white/70 border border-amber-100 p-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <Label className="text-xs flex items-center gap-1.5">
            🌙 免打扰时段
          </Label>
          <Switch
            checked={policy.quiet_hours_enabled}
            onCheckedChange={(v) => set({ quiet_hours_enabled: v })}
          />
        </div>
        {policy.quiet_hours_enabled && (
          <div className="flex items-center gap-2">
            <Input
              type="time"
              value={policy.quiet_hours_start}
              onChange={(e) => set({ quiet_hours_start: e.target.value })}
              className="h-8 text-xs"
            />
            <span className="text-xs text-slate-400">至</span>
            <Input
              type="time"
              value={policy.quiet_hours_end}
              onChange={(e) => set({ quiet_hours_end: e.target.value })}
              className="h-8 text-xs"
            />
          </div>
        )}
      </div>
    </div>
  );
}