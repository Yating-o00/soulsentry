import React, { useEffect, useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { MapPin, ListChecks } from 'lucide-react';
import { toast } from 'sonner';
import QuietPolicyEditor, { DEFAULT_QUIET_POLICY } from './QuietPolicyEditor';

/**
 * 点击地图标记后的快速编辑弹窗：
 * - 调整触发条件（半径、触发方式、静默期、启用）
 * - 勾选与该地点相关的任务（写入 task.location_reminder）
 */
export default function LocationEditDialog({ open, onOpenChange, location }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState(null);

  useEffect(() => {
    if (location) {
      setForm({
        radius: location.radius || 200,
        trigger_on: location.trigger_on || 'enter',
        quiet_minutes: location.quiet_minutes || 30,
        is_active: location.is_active ?? true,
        quiet_policy: { ...DEFAULT_QUIET_POLICY, ...(location.quiet_policy || {}) }
      });
    }
  }, [location]);

  const { data: tasks = [] } = useQuery({
    queryKey: ['tasks-for-location'],
    queryFn: () => base44.entities.Task.filter({ status: 'pending' }, '-reminder_time', 50),
    initialData: [],
    enabled: open
  });

  const updateLocation = useMutation({
    mutationFn: (patch) => base44.entities.SavedLocation.update(location.id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-locations'] });
      toast.success('触发条件已更新');
    }
  });

  const updateTaskLink = useMutation({
    mutationFn: async ({ taskId, linked }) => {
      const payload = linked
        ? {
            location_reminder: {
              enabled: true,
              latitude: location.latitude,
              longitude: location.longitude,
              radius: location.radius || 200,
              location_name: location.name,
              trigger_on: location.trigger_on || 'enter'
            }
          }
        : { location_reminder: { enabled: false } };
      return base44.entities.Task.update(taskId, payload);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tasks-for-location'] })
  });

  if (!location || !form) return null;

  const handleSaveConditions = () => updateLocation.mutate(form);

  const isTaskLinked = (t) =>
    t.location_reminder?.enabled && t.location_reminder?.location_name === location.name;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-2xl">{location.icon || '📍'}</span>
            {location.name}
          </DialogTitle>
          <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
            <MapPin className="w-3 h-3" />
            {location.address || `${location.latitude?.toFixed(4)}, ${location.longitude?.toFixed(4)}`}
          </p>
        </DialogHeader>

        {/* 触发条件 */}
        <div className="space-y-3 border-b border-slate-100 pb-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">触发条件</h4>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-slate-500">启用</Label>
              <Switch
                checked={form.is_active}
                onCheckedChange={(v) => setForm({ ...form, is_active: v })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">半径（米）</Label>
              <Input
                type="number"
                value={form.radius}
                onChange={(e) => setForm({ ...form, radius: parseInt(e.target.value) || 200 })}
                className="mt-1 h-9"
              />
            </div>
            <div>
              <Label className="text-xs">静默期（分钟）</Label>
              <Input
                type="number"
                value={form.quiet_minutes}
                onChange={(e) => setForm({ ...form, quiet_minutes: parseInt(e.target.value) || 30 })}
                className="mt-1 h-9"
              />
            </div>
          </div>

          <div>
            <Label className="text-xs">触发方式</Label>
            <Select
              value={form.trigger_on}
              onValueChange={(v) => setForm({ ...form, trigger_on: v })}
            >
              <SelectTrigger className="mt-1 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enter">进入时</SelectItem>
                <SelectItem value="exit">离开时</SelectItem>
                <SelectItem value="both">进入与离开都触发</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <QuietPolicyEditor
            value={form.quiet_policy}
            onChange={(qp) => setForm({ ...form, quiet_policy: qp })}
          />

          <Button
            size="sm"
            className="w-full bg-[#384877] hover:bg-[#2d3a61]"
            onClick={handleSaveConditions}
            disabled={updateLocation.isPending}
          >
            {updateLocation.isPending ? '保存中...' : '保存触发条件'}
          </Button>
        </div>

        {/* 任务相关性 */}
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <h4 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
            <ListChecks className="w-4 h-4" />
            任务相关性
            <Badge variant="outline" className="text-[10px] ml-1">
              {tasks.filter(isTaskLinked).length} 已关联
            </Badge>
          </h4>
          <p className="text-xs text-slate-500 -mt-1">勾选后，任务会绑定到该地点的地理围栏</p>

          {tasks.length === 0 ? (
            <p className="text-xs text-slate-400 py-4 text-center">暂无待办任务</p>
          ) : (
            tasks.map((t) => {
              const linked = isTaskLinked(t);
              return (
                <label
                  key={t.id}
                  className="flex items-center gap-2 p-2 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={linked}
                    onChange={(e) =>
                      updateTaskLink.mutate({ taskId: t.id, linked: e.target.checked })
                    }
                    className="w-4 h-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-700 flex-1 truncate">{t.title}</span>
                  {t.priority && (
                    <Badge variant="outline" className="text-[10px]">{t.priority}</Badge>
                  )}
                </label>
              );
            })
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}