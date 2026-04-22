import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Plus, Trash2, Crosshair } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import LocationEditDialog from './LocationEditDialog';

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

// Emoji-based divIcon (avoid leaflet default-marker asset 404 issues)
const makeIcon = (emoji, active) =>
  L.divIcon({
    html: `<div style="
      font-size:24px;
      line-height:1;
      filter:${active ? 'none' : 'grayscale(1) opacity(0.5)'};
      text-align:center;
      transform:translate(-50%,-100%);
    ">${emoji || '📍'}</div>`,
    className: 'geofence-emoji-marker',
    iconSize: [28, 28]
  });

function FitBounds({ points }) {
  const map = useMap();
  React.useEffect(() => {
    if (!points.length) return;
    if (points.length === 1) {
      map.setView([points[0].latitude, points[0].longitude], 14);
    } else {
      const bounds = L.latLngBounds(points.map((p) => [p.latitude, p.longitude]));
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [points, map]);
  return null;
}

/**
 * 地图视图：展示所有 SavedLocation、管理触发条件、内嵌新建/删除。
 */
export default function GeofenceMapView() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['saved-locations'],
    queryFn: () => base44.entities.SavedLocation.list('-created_date'),
    initialData: []
  });

  const validLocations = useMemo(
    () => locations.filter((l) => typeof l.latitude === 'number' && typeof l.longitude === 'number'),
    [locations]
  );

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
      (err) => toast.error('获取位置失败: ' + err.message, { id: 'geo' }),
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const handleTypeChange = (type) => {
    const preset = LOCATION_TYPES.find((t) => t.value === type);
    setForm((f) => ({ ...f, location_type: type, icon: preset?.icon || '📍' }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) return toast.error('请输入地点名称');
    if (form.latitude === null || form.longitude === null) return toast.error('请获取或输入坐标');
    createMutation.mutate(form);
  };

  const center = validLocations[0]
    ? [validLocations[0].latitude, validLocations[0].longitude]
    : [31.2304, 121.4737];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">地点围栏</h3>
            <p className="text-[11px] text-slate-500">
              {validLocations.length} 个地点 · 点击标记编辑触发条件
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => {
            setForm(EMPTY_FORM);
            setDialogOpen(true);
          }}
        >
          <Plus className="w-3.5 h-3.5 mr-1" />新增地点
        </Button>
      </div>

      {isLoading ? (
        <div className="py-12 text-center text-slate-400 text-sm bg-white rounded-xl border border-slate-200">
          加载中...
        </div>
      ) : validLocations.length === 0 ? (
        <div className="py-12 text-center bg-white rounded-xl border border-dashed border-slate-200">
          <MapPin className="w-8 h-8 mx-auto mb-2 text-slate-300" />
          <p className="text-sm text-slate-600 font-medium mb-1">还没有保存的地点</p>
          <p className="text-xs text-slate-400 mb-3">添加地点后可在地图上查看并管理触发围栏</p>
          <Button size="sm" className="bg-[#384877] hover:bg-[#2d3a61]" onClick={() => setDialogOpen(true)}>
            去添加地点
          </Button>
        </div>
      ) : (
        <>
          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm" style={{ height: 480 }}>
            <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%' }}>
              <TileLayer
                attribution='&copy; OpenStreetMap'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              <FitBounds points={validLocations} />

              {validLocations.map((loc) => (
                <React.Fragment key={loc.id}>
                  <Circle
                    center={[loc.latitude, loc.longitude]}
                    radius={loc.radius || 200}
                    pathOptions={{
                      color: loc.is_active ? '#3b5aa2' : '#94a3b8',
                      fillColor: loc.is_active ? '#3b5aa2' : '#94a3b8',
                      fillOpacity: 0.12,
                      weight: 1.5
                    }}
                  />
                  <Marker
                    position={[loc.latitude, loc.longitude]}
                    icon={makeIcon(loc.icon, loc.is_active)}
                    eventHandlers={{ click: () => setEditing(loc) }}
                  >
                    <Popup>
                      <div className="min-w-[160px]">
                        <div className="font-semibold text-sm mb-1">
                          {loc.icon} {loc.name}
                        </div>
                        <div className="text-xs text-slate-500 mb-2">
                          半径 {loc.radius}m ·{' '}
                          {loc.trigger_on === 'enter'
                            ? '进入时'
                            : loc.trigger_on === 'exit'
                            ? '离开时'
                            : '进出都'}
                          触发
                        </div>
                        <Button size="sm" className="w-full h-7 text-xs" onClick={() => setEditing(loc)}>
                          编辑触发条件
                        </Button>
                      </div>
                    </Popup>
                  </Marker>
                </React.Fragment>
              ))}
            </MapContainer>
          </div>

          {/* 地点列表 */}
          <div className="grid gap-2">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="bg-white rounded-xl p-3 border border-slate-200 flex items-center gap-3"
              >
                <div className="text-2xl">{loc.icon || '📍'}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <h4 className="font-medium text-slate-900 text-sm truncate">{loc.name}</h4>
                    <span className="px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded text-[10px] flex-shrink-0">
                      {LOCATION_TYPES.find((t) => t.value === loc.location_type)?.label || '其他'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 truncate">
                    半径 {loc.radius}m ·{' '}
                    {loc.trigger_on === 'enter' ? '进入时' : loc.trigger_on === 'exit' ? '离开时' : '进出都'}触发 ·
                    静默 {loc.quiet_minutes}分
                  </div>
                </div>
                <Switch
                  checked={loc.is_active}
                  onCheckedChange={(v) => toggleMutation.mutate({ id: loc.id, is_active: v })}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => {
                    if (window.confirm(`删除地点"${loc.name}"？`)) deleteMutation.mutate(loc.id);
                  }}
                >
                  <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      {/* 编辑触发条件 */}
      <LocationEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        location={editing}
      />

      {/* 新增地点 */}
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
                <Crosshair className="w-4 h-4 mr-2" />使用当前位置
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
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending}
              className="bg-[#384877] hover:bg-[#2d3a61]"
            >
              {createMutation.isPending ? '保存中...' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}