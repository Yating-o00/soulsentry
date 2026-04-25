import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Plus, Trash2, Crosshair, Sparkles, Check } from 'lucide-react';
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

  // 定位授权/状态对话框
  const [geoDialog, setGeoDialog] = useState({ open: false, phase: 'ask', message: '', coords: null });
  // phase: 'ask' | 'loading' | 'success' | 'error'

  // AI 参数建议
  const [aiSuggest, setAiSuggest] = useState({ loading: false, data: null });

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
      setAiSuggest({ loading: false, data: null });
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

  // 点击"使用当前位置"——先弹出授权确认对话框
  const openGeoDialog = () => {
    setGeoDialog({ open: true, phase: 'ask', message: '', coords: null });
  };

  // 用户在对话框确认授权后，真正执行定位
  const confirmAndLocate = async () => {
    setGeoDialog((s) => ({ ...s, phase: 'loading', message: '正在获取位置...' }));

    const applyCoords = (lat, lng, source) => {
      const la = Number(lat.toFixed(6));
      const ln = Number(lng.toFixed(6));
      setForm((f) => ({ ...f, latitude: la, longitude: ln }));
      setGeoDialog({
        open: true,
        phase: 'success',
        message: source === 'ip' ? '已使用网络定位（精度较低）' : '定位成功（GPS/浏览器）',
        coords: { lat: la, lng: ln, source }
      });
    };

    // 多服务 IP 定位回退（国内环境 ipapi.co 常被拦截，依次尝试多个）
    const IP_PROVIDERS = [
      { url: 'https://ipwho.is/', parse: (d) => (d && d.success !== false ? { lat: d.latitude, lng: d.longitude } : null) },
      { url: 'https://ipapi.co/json/', parse: (d) => (d ? { lat: d.latitude, lng: d.longitude } : null) },
      { url: 'https://ipapi.com/json/', parse: (d) => (d ? { lat: d.latitude, lng: d.longitude } : null) },
      { url: 'https://freeipapi.com/api/json', parse: (d) => (d ? { lat: d.latitude, lng: d.longitude } : null) }
    ];

    const tryOneProvider = async (p) => {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 5000);
      try {
        const res = await fetch(p.url, { signal: ctrl.signal });
        if (!res.ok) return null;
        const data = await res.json();
        const c = p.parse(data);
        if (c && typeof c.lat === 'number' && typeof c.lng === 'number') return c;
        return null;
      } catch {
        return null;
      } finally {
        clearTimeout(t);
      }
    };

    const fallbackByIP = async (prefix = '') => {
      for (const p of IP_PROVIDERS) {
        const c = await tryOneProvider(p);
        if (c) {
          applyCoords(c.lat, c.lng, 'ip');
          return;
        }
      }
      setGeoDialog({
        open: true,
        phase: 'error',
        message:
          prefix +
          '网络定位也不可用（可能是网络受限或被浏览器拦截）。请在下方手动输入经纬度坐标，或在浏览器地址栏左侧解除站点的定位权限限制后重试。',
        coords: null
      });
    };

    if (!navigator.geolocation) {
      await fallbackByIP('当前浏览器不支持 Geolocation。');
      return;
    }

    let finished = false;
    const timer = setTimeout(() => {
      if (finished) return;
      finished = true;
      fallbackByIP('浏览器定位超时，改用网络定位。');
    }, 8000);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        applyCoords(pos.coords.latitude, pos.coords.longitude, 'gps');
      },
      async (err) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        if (err.code === 1) {
          await fallbackByIP('浏览器已拒绝定位权限，改用网络定位。');
        } else {
          await fallbackByIP('浏览器定位不可用（' + (err.message || 'code ' + err.code) + '），改用网络定位。');
        }
      },
      { enableHighAccuracy: true, timeout: 7000, maximumAge: 60000 }
    );
  };

  const handleTypeChange = (type) => {
    const preset = LOCATION_TYPES.find((t) => t.value === type);
    setForm((f) => ({ ...f, location_type: type, icon: preset?.icon || '📍' }));
    // 切换类型时清空旧建议
    setAiSuggest({ loading: false, data: null });
  };

  // AI 建议：根据类型/坐标/历史数据推荐半径与静默期
  const fetchAISuggestion = async () => {
    setAiSuggest({ loading: true, data: null });
    try {
      const res = await base44.functions.invoke('suggestGeofenceParams', {
        location_type: form.location_type,
        name: form.name,
        address: form.address,
        latitude: form.latitude,
        longitude: form.longitude
      });
      const data = res?.data;
      if (!data || typeof data.radius !== 'number') {
        throw new Error(data?.error || '无建议数据');
      }
      setAiSuggest({ loading: false, data });
      toast.success('已生成 AI 建议');
    } catch (e) {
      setAiSuggest({ loading: false, data: null });
      toast.error('AI 建议失败：' + (e.message || '未知错误'));
    }
  };

  const applyAISuggestion = () => {
    if (!aiSuggest.data) return;
    const d = aiSuggest.data;
    setForm((f) => ({
      ...f,
      radius: d.radius,
      quiet_minutes: d.quiet_minutes,
      // 若 AI 通过地址解析出坐标，一并填入
      latitude: typeof d.latitude === 'number' ? d.latitude : f.latitude,
      longitude: typeof d.longitude === 'number' ? d.longitude : f.longitude
    }));
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

          <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm relative" style={{ height: 480, zIndex: 0 }}>
            <MapContainer center={center} zoom={13} style={{ height: '100%', width: '100%', zIndex: 0 }}>
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
        </>
      )}

      {/* 编辑触发条件 */}
      <LocationEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        location={editing}
      />

      {/* 定位权限 & 状态对话框 */}
      <Dialog
        open={geoDialog.open}
        onOpenChange={(o) => {
          // loading 中不允许关闭，防止用户误触
          if (geoDialog.phase === 'loading') return;
          setGeoDialog((s) => ({ ...s, open: o }));
        }}
      >
        <DialogContent className="max-w-sm z-[9999]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-blue-500" />
              {geoDialog.phase === 'ask' && '获取当前位置'}
              {geoDialog.phase === 'loading' && '正在定位...'}
              {geoDialog.phase === 'success' && '定位成功'}
              {geoDialog.phase === 'error' && '定位失败'}
            </DialogTitle>
          </DialogHeader>

          <div className="py-2 text-sm text-slate-600 space-y-3">
            {geoDialog.phase === 'ask' && (
              <>
                <p>需要获取你的当前位置以自动填写坐标。</p>
                <p className="text-xs text-slate-500">
                  点击「允许」后，浏览器将请求定位权限。如果被拒绝或不可用，会尝试使用网络（IP）定位。
                </p>
              </>
            )}
            {geoDialog.phase === 'loading' && (
              <div className="flex items-center gap-2 text-slate-600">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span>正在获取位置，请稍候（最多 8 秒）...</span>
              </div>
            )}
            {geoDialog.phase === 'success' && geoDialog.coords && (
              <div className="space-y-2">
                <p>{geoDialog.message}</p>
                <div className="bg-slate-50 rounded-lg p-3 border border-slate-200 font-mono text-xs">
                  <div>纬度（lat）：<span className="text-blue-600 font-semibold">{geoDialog.coords.lat}</span></div>
                  <div>经度（lng）：<span className="text-blue-600 font-semibold">{geoDialog.coords.lng}</span></div>
                  <div className="text-slate-400 mt-1">来源：{geoDialog.coords.source === 'ip' ? 'IP 网络定位' : 'GPS / 浏览器'}</div>
                </div>
                <p className="text-xs text-slate-500">坐标已自动填入表单。</p>
              </div>
            )}
            {geoDialog.phase === 'error' && (
              <p className="text-red-600">{geoDialog.message}</p>
            )}
          </div>

          <DialogFooter>
            {geoDialog.phase === 'ask' && (
              <>
                <Button variant="outline" onClick={() => setGeoDialog((s) => ({ ...s, open: false }))}>
                  取消
                </Button>
                <Button className="bg-[#384877] hover:bg-[#2d3a61]" onClick={confirmAndLocate}>
                  允许并定位
                </Button>
              </>
            )}
            {geoDialog.phase === 'loading' && (
              <Button variant="outline" disabled>定位中...</Button>
            )}
            {(geoDialog.phase === 'success' || geoDialog.phase === 'error') && (
              <Button onClick={() => setGeoDialog((s) => ({ ...s, open: false }))}>
                完成
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 新增地点 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
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
                onClick={openGeoDialog}
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

            {/* AI 推荐卡片 */}
            <div className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-blue-50/60 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-800">AI 智能推荐</div>
                    <div className="text-[10px] text-slate-500">根据详细地址解析坐标，并建议半径与静默期</div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs flex-shrink-0 border-indigo-200 text-indigo-600 hover:bg-indigo-50"
                  onClick={fetchAISuggestion}
                  disabled={aiSuggest.loading}
                >
                  {aiSuggest.loading ? (
                    <>
                      <div className="w-3 h-3 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin mr-1" />
                      分析中
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3 h-3 mr-1" />
                      {aiSuggest.data ? '重新生成' : '获取建议'}
                    </>
                  )}
                </Button>
              </div>
              {aiSuggest.data && (
                <div className="mt-2.5 space-y-2">
                  {typeof aiSuggest.data.latitude === 'number' && (
                    <div className="rounded-lg bg-white border border-indigo-200 p-2 text-[11px] space-y-0.5">
                      <div className="text-slate-500">📍 已从地址解析出坐标</div>
                      <div className="font-mono text-slate-700">
                        {aiSuggest.data.latitude}, {aiSuggest.data.longitude}
                      </div>
                      {aiSuggest.data.resolved_address && (
                        <div className="text-slate-500 truncate" title={aiSuggest.data.resolved_address}>
                          {aiSuggest.data.resolved_address}
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs">
                    <span className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 font-mono">
                      半径 {aiSuggest.data.radius}m
                    </span>
                    <span className="px-2 py-0.5 rounded-md bg-white border border-indigo-200 text-indigo-700 font-mono">
                      静默 {aiSuggest.data.quiet_minutes}分
                    </span>
                    <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                      aiSuggest.data.confidence === 'high' ? 'bg-emerald-100 text-emerald-700'
                      : aiSuggest.data.confidence === 'medium' ? 'bg-amber-100 text-amber-700'
                      : 'bg-slate-100 text-slate-600'
                    }`}>
                      {aiSuggest.data.confidence === 'high' ? '高置信度'
                        : aiSuggest.data.confidence === 'medium' ? '中置信度' : '低置信度'}
                    </span>
                  </div>
                  {aiSuggest.data.reasoning && (
                    <p className="text-[11px] text-slate-600 leading-relaxed">
                      💡 {aiSuggest.data.reasoning}
                    </p>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="w-full h-7 text-xs bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600"
                    onClick={applyAISuggestion}
                  >
                    <Check className="w-3 h-3 mr-1" />
                    应用推荐值
                  </Button>
                </div>
              )}
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