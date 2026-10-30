import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Plus } from "lucide-react";
import { toast } from "sonner";

// 位置 · 高德地图：搜索地点 → 一键存为地理围栏
export default function AmapLocationPanel() {
  const [keyword, setKeyword] = useState("");
  const [places, setPlaces] = useState([]);
  const [loading, setLoading] = useState(false);

  const search = async () => {
    if (!keyword.trim()) return;
    setLoading(true);
    try {
      const { data } = await base44.functions.invoke("amapSearch", { keyword });
      setPlaces(data.places || []);
      if (!data.places?.length) toast.info("没有找到相关地点");
    } catch (e) {
      toast.error(e?.response?.data?.error || "搜索失败");
    } finally {
      setLoading(false);
    }
  };

  const save = async (p) => {
    await base44.entities.SavedLocation.create({ name: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude });
    toast.success(`已保存「${p.name}」，进入附近时会提醒相关约定`);
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold text-slate-800">位置 · 高德地图</h3>
        <p className="text-sm text-slate-500 mt-1">用高德地图搜索常去的地点（家、公司、健身房…），保存后进入或离开时自动提醒相关约定。</p>
      </div>
      <div className="flex gap-2">
        <Input value={keyword} onChange={(e) => setKeyword(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} placeholder="如：北京国贸、上海静安寺健身房" />
        <Button onClick={search} disabled={loading}>{loading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}搜索</Button>
        <Button variant="outline" onClick={() => (window.location.href = "/Notifications?tab=map")}>管理地点</Button>
      </div>
      <div className="space-y-2">
        {places.map((p, i) => (
          <div key={i} className="flex items-center gap-3 bg-white rounded-xl border border-slate-200 px-3 py-2">
            <MapPin className="w-4 h-4 text-[#384877] shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-slate-800 truncate">{p.name}</p>
              <p className="text-xs text-slate-500 truncate">{p.address}</p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => save(p)}><Plus className="w-4 h-4 mr-1" />保存</Button>
          </div>
        ))}
      </div>
    </div>
  );
}