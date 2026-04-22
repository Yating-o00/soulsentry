import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { MapPin, Plus, Trash2, Crosshair, Home, Building, Dumbbell, ShoppingBag } from 'lucide-react';
import { toast } from 'sonner';
import { useGeolocation } from '@/components/hooks/useGeolocation';

const LOCATION_TYPES = [
  { value: 'home', label: '家', icon: '🏠' },
  { value: 'office', label: '公司', icon: '🏢' },
  { value: 'gym', label: '健身房', icon: '💪' },
  { value: 'school', label: '学校', icon: '🎓' },
  { value: 'shopping', label: '商场', icon: '🛍️' },
  { value: 'hospital', label: '医院', icon: '🏥' },
  { value: 'restaurant', label: '餐厅', icon: '🍽️' },
  { value: 'other', label: '其他', icon: '📍' }
];

const EMPTY_FORM = {
  name: '',
  location_type: 'other',
  latitude: null,
  longitude: null,
  radius: 200,
  address: '',
  icon: '📍',
  is_active: true,
  trigger_on: 'enter',
  quiet_minutes: 30
};

export default function SavedLocations() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const { requestPermission, permission } = useGeolocation({ enabled: false });

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['saved-locations'],
    queryFn: () => base44.entities.SavedLocation.list('-created_date'),
    initialData: []
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.SavedLocation.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-locations'] });
      setDialogOpen(false);
      setForm(EMPTY_FORM);
      toast.success('地点已保存');
    },
    onError: (e) => toast.error('保存失败: ' + e.message)
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => base44.entities.SavedLocation.update(id, { is_active }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved-locations'] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.SavedLocation.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['saved-locations'] });
      toast.success('已删除');
    }
  });

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error('当前浏览器不支持定位');
      return;
    }
    toast.loading('正在获取当前位置...', { id: 'geo' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setForm((f) => ({
          ...f,
          latitude: Number(pos.coords.latitude.toFixed(6)),
          longitude: Number(pos.coords.longitude.toFixed(6))
        }));
        toast.success('位置已获取', { id: 'geo' });
      },
      (err) => {
        toast.error('获取位置失败: ' + err.message, { id: 'geo' });
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleTypeChange = (type) => {
    const preset = LOCATION_TYPES.find((t) => t.value === type);
    setForm((f) => ({ ...f, location_type: type, icon: preset?.icon || '📍' }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error('请输入地点名称');
      return;
    }
    if (form.latitude === null || form.longitude === null) {
      toast.error('请获取或输入坐标');
      return;
    }
    createMutation.mutate(form);
  };

  return (
    <div className="min-h-screen bg-[#f8f9fa] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 mb-2 flex items-center gap-3">
              <MapPin className="w-8 h-8 text-blue-600" />
              地点围栏
            </h1>
            <p className="text-slate-500">设置常用地点，当你到达或离开时自动提醒相关待办</p>
          </div>
          <Button onClick={() => setDialogOpen(true)} className="bg-[#384877] hover:bg-[#2d3a61]">
            <Plus className="w-4 h-4 mr-2" />
            添加地点
          </Button>
        </div>

        {permission === 'denied' && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-sm">
            ⚠️ 定位权限已被拒绝。请在浏览器设置中允许定位，才能启用地理围栏提醒。
          </div>
        )}

        {permission === 'prompt' && (
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between">
            <div className="text-blue-800 text-sm">
              📍 启用定位权限后，地点围栏才能生效
            </div>
            <Button size="sm" variant="outline" onClick={requestPermission}>开启定位</Button>
          </div>
        )}

        {isLoading ? (
          <div className="text-center py-12 text-slate-400">加载中...</div>
        ) : locations.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
            <MapPin className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">还没有添加任何地点</p>
            <p className="text-sm text-slate-400 mt-1">点击上方"添加地点"来设置你的第一个地理围栏</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {locations.map((loc) => (
              <div key={loc.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm flex items-start gap-4">
                <div className="text-3xl">{loc.icon || '📍'}</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-slate-900">{loc.name}</h3>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full text-xs">
                      {LOCATION_TYPES.find((t) => t.value === loc.location_type)?.label || '其他'}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500 mb-2">
                    {loc.address || `${loc.latitude?.toFixed(4)}, ${loc.longitude?.toFixed(4)}`}
                  </p>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span>半径: {loc.radius}m</span>
                    <span>·</span>
                    <span>
                      {loc.trigger_on === 'enter' ? '进入时提醒' : loc.trigger_on === 'exit' ? '离开时提醒' : '进出都提醒'}
                    </span>
                    <span>·</span>
                    <span>静默期 {loc.quiet_minutes}分</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={loc.is_active}
                    onCheckedChange={(v) => toggleMutation.mutate({ id: loc.id, is_active: v })}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      if (window.confirm(`删除地点"${loc.name}"？`)) deleteMutation.mutate(loc.id);
                    }}
                  >
                    <Trash2 className="w-4 h-4 text-red-500" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>添加地点</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>地点名称</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="例如：公司、家"
                className="mt-1"
              />
            </div>

            <div>
              <Label>地点类型</Label>
              <Select value={form.location_type} onValueChange={handleTypeChange}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>
                      {t.icon} {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>位置坐标</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  type="number"
                  step="0.000001"
                  value={form.latitude ?? ''}
                  onChange={(e) => setForm({ ...form, latitude: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="纬度"
                />
                <Input
                  type="number"
                  step="0.000001"
                  value={form.longitude ?? ''}
                  onChange={(e) => setForm({ ...form, longitude: e.target.value ? parseFloat(e.target.value) : null })}
                  placeholder="经度"
                />
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 w-full"
                onClick={useCurrentLocation}
              >
                <Crosshair className="w-4 h-4 mr-2" />
                使用当前位置
              </Button>
            </div>

            <div>
              <Label>详细地址（可选）</Label>
              <Input
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                placeholder="例如：北京市朝阳区xx路"
                className="mt-1"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>半径（米）</Label>
                <Input
                  type="number"
                  value={form.radius}
                  onChange={(e) => setForm({ ...form, radius: parseInt(e.target.value) || 200 })}
                  className="mt-1"
                />
              </div>
              <div>
                <Label>静默期（分钟）</Label>
                <Input
                  type="number"
                  value={form.quiet_minutes}
                  onChange={(e) => setForm({ ...form, quiet_minutes: parseInt(e.target.value) || 30 })}
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label>触发方式</Label>
              <Select value={form.trigger_on} onValueChange={(v) => setForm({ ...form, trigger_on: v })}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="enter">进入时</SelectItem>
                  <SelectItem value="exit">离开时</SelectItem>
                  <SelectItem value="both">进入与离开都触发</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={createMutation.isPending} className="bg-[#384877] hover:bg-[#2d3a61]">
              {createMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}