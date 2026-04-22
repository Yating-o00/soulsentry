import React, { useState, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { MapContainer, TileLayer, Circle, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { MapPin, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { Button } from '@/components/ui/button';
import LocationEditDialog from './LocationEditDialog';

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
 * 地图视图：展示所有 SavedLocation 及触发半径。
 * 点击 Marker → 打开编辑弹窗（修改触发条件、关联任务）。
 */
export default function GeofenceMapView() {
  const [editing, setEditing] = useState(null);

  const { data: locations = [], isLoading } = useQuery({
    queryKey: ['saved-locations'],
    queryFn: () => base44.entities.SavedLocation.list('-created_date'),
    initialData: []
  });

  const validLocations = useMemo(
    () => locations.filter((l) => typeof l.latitude === 'number' && typeof l.longitude === 'number'),
    [locations]
  );

  const center = validLocations[0]
    ? [validLocations[0].latitude, validLocations[0].longitude]
    : [31.2304, 121.4737]; // 默认上海

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-sm">
            <MapPin className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">地图视图</h3>
            <p className="text-[11px] text-slate-500">
              {validLocations.length} 个地点 · 点击标记编辑触发条件
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm" className="h-8 text-xs">
          <Link to={createPageUrl('SavedLocations')}>
            <Plus className="w-3.5 h-3.5 mr-1" />新增地点
          </Link>
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
          <Button asChild size="sm" className="bg-[#384877] hover:bg-[#2d3a61]">
            <Link to={createPageUrl('SavedLocations')}>去添加地点</Link>
          </Button>
        </div>
      ) : (
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
      )}

      <LocationEditDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        location={editing}
      />
    </div>
  );
}