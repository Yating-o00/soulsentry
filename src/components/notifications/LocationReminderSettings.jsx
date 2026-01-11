import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation, Target, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";

export default function LocationReminderSettings({ taskDefaults, onUpdate }) {
  const [locationEnabled, setLocationEnabled] = useState(taskDefaults?.location_reminder?.enabled || false);
  const [locationPermission, setLocationPermission] = useState("prompt");
  const [currentLocation, setCurrentLocation] = useState(null);
  const [settings, setSettings] = useState({
    latitude: taskDefaults?.location_reminder?.latitude || null,
    longitude: taskDefaults?.location_reminder?.longitude || null,
    radius: taskDefaults?.location_reminder?.radius || 500,
    location_name: taskDefaults?.location_reminder?.location_name || "",
    trigger_on: taskDefaults?.location_reminder?.trigger_on || "enter"
  });

  useEffect(() => {
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setLocationPermission(result.state);
        result.addEventListener('change', () => {
          setLocationPermission(result.state);
        });
      });
    }
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("您的浏览器不支持地理定位");
      return;
    }

    toast.loading("正在获取位置...", { id: "location" });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCurrentLocation({ latitude, longitude });
        
        const newSettings = {
          ...settings,
          latitude,
          longitude,
          location_name: settings.location_name || `位置 ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`
        };
        
        setSettings(newSettings);
        handleUpdate(newSettings);
        
        toast.success("位置获取成功！", { id: "location" });
      },
      (error) => {
        toast.error(`获取位置失败: ${error.message}`, { id: "location" });
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0
      }
    );
  };

  const handleUpdate = (newSettings) => {
    onUpdate?.({
      location_reminder: {
        enabled: locationEnabled,
        ...newSettings
      }
    });
  };

  const handleToggle = (enabled) => {
    setLocationEnabled(enabled);
    onUpdate?.({
      location_reminder: {
        enabled,
        ...settings
      }
    });
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <MapPin className="w-5 h-5 text-green-500" />
          地理位置提醒
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <Label htmlFor="location-enabled" className="text-base font-medium">
              启用位置提醒
            </Label>
            <p className="text-sm text-slate-600 mt-1">
              到达或离开指定位置时自动提醒
            </p>
          </div>
          <Switch
            id="location-enabled"
            checked={locationEnabled}
            onCheckedChange={handleToggle}
          />
        </div>

        <AnimatePresence>
          {locationEnabled && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-4 border-t"
            >
              {locationPermission === "denied" && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-red-700">
                    <p className="font-medium">位置权限已被拒绝</p>
                    <p className="text-xs mt-1">请在浏览器设置中允许位置访问</p>
                  </div>
                </div>
              )}

              <div>
                <Label className="text-sm font-medium mb-2 block">位置名称</Label>
                <Input
                  placeholder="例如：公司、家、健身房"
                  value={settings.location_name}
                  onChange={(e) => {
                    const newSettings = { ...settings, location_name: e.target.value };
                    setSettings(newSettings);
                    handleUpdate(newSettings);
                  }}
                  className="bg-slate-50 border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-sm font-medium mb-2 block">纬度</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    placeholder="纬度"
                    value={settings.latitude || ""}
                    onChange={(e) => {
                      const newSettings = { ...settings, latitude: parseFloat(e.target.value) };
                      setSettings(newSettings);
                      handleUpdate(newSettings);
                    }}
                    className="bg-slate-50 border-slate-200"
                  />
                </div>
                <div>
                  <Label className="text-sm font-medium mb-2 block">经度</Label>
                  <Input
                    type="number"
                    step="0.000001"
                    placeholder="经度"
                    value={settings.longitude || ""}
                    onChange={(e) => {
                      const newSettings = { ...settings, longitude: parseFloat(e.target.value) };
                      setSettings(newSettings);
                      handleUpdate(newSettings);
                    }}
                    className="bg-slate-50 border-slate-200"
                  />
                </div>
              </div>

              <Button
                onClick={getCurrentLocation}
                variant="outline"
                className="w-full border-green-200 hover:bg-green-50"
                disabled={locationPermission === "denied"}
              >
                <Navigation className="w-4 h-4 mr-2" />
                使用当前位置
              </Button>

              <div>
                <Label className="text-sm font-medium mb-2 block">触发半径 (米)</Label>
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    step="50"
                    min="50"
                    max="5000"
                    value={settings.radius}
                    onChange={(e) => {
                      const newSettings = { ...settings, radius: parseInt(e.target.value) };
                      setSettings(newSettings);
                      handleUpdate(newSettings);
                    }}
                    className="bg-slate-50 border-slate-200"
                  />
                  <span className="text-sm text-slate-600 whitespace-nowrap">米</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  当距离目标位置 {settings.radius} 米内时触发提醒
                </p>
              </div>

              <div>
                <Label className="text-sm font-medium mb-2 block">触发条件</Label>
                <Select
                  value={settings.trigger_on}
                  onValueChange={(value) => {
                    const newSettings = { ...settings, trigger_on: value };
                    setSettings(newSettings);
                    handleUpdate(newSettings);
                  }}
                >
                  <SelectTrigger className="bg-slate-50 border-slate-200">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="enter">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-green-600" />
                        <span>进入区域时</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="exit">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-orange-600" />
                        <span>离开区域时</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="both">
                      <div className="flex items-center gap-2">
                        <Target className="w-4 h-4 text-blue-600" />
                        <span>进入和离开时</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {currentLocation && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-green-700 text-sm">
                    <MapPin className="w-4 h-4" />
                    <span className="font-medium">当前位置已设置</span>
                  </div>
                  <p className="text-xs text-green-600 mt-1">
                    {currentLocation.latitude.toFixed(6)}, {currentLocation.longitude.toFixed(6)}
                  </p>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}