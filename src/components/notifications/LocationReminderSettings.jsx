import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MapPin, Navigation, Loader2, CheckCircle2 } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";

export default function LocationReminderSettings({ locationReminder, onUpdate }) {
  const [settings, setSettings] = useState({
    enabled: locationReminder?.enabled || false,
    latitude: locationReminder?.latitude || null,
    longitude: locationReminder?.longitude || null,
    address: locationReminder?.address || "",
    radius: locationReminder?.radius || 100,
    trigger_on: locationReminder?.trigger_on || "arrival"
  });

  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [locationPermission, setLocationPermission] = useState("prompt");

  useEffect(() => {
    // Check location permission status
    if (navigator.permissions) {
      navigator.permissions.query({ name: 'geolocation' }).then(result => {
        setLocationPermission(result.state);
        result.onchange = () => setLocationPermission(result.state);
      });
    }
  }, []);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      toast.error("您的浏览器不支持地理定位");
      return;
    }

    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;
        
        try {
          // Reverse geocoding to get address
          const response = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}`
          );
          const data = await response.json();
          const address = data.display_name || `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;

          const newSettings = {
            ...settings,
            latitude,
            longitude,
            address,
            enabled: true
          };
          
          setSettings(newSettings);
          onUpdate?.(newSettings);
          toast.success("已获取当前位置");
        } catch (error) {
          const newSettings = {
            ...settings,
            latitude,
            longitude,
            address: `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`,
            enabled: true
          };
          setSettings(newSettings);
          onUpdate?.(newSettings);
          toast.success("已获取当前位置");
        }
        
        setIsGettingLocation(false);
      },
      (error) => {
        setIsGettingLocation(false);
        if (error.code === error.PERMISSION_DENIED) {
          toast.error("位置权限被拒绝，请在浏览器设置中允许位置访问");
        } else {
          toast.error("无法获取位置信息");
        }
      }
    );
  };

  const handleSettingChange = (key, value) => {
    const newSettings = { ...settings, [key]: value };
    setSettings(newSettings);
    onUpdate?.(newSettings);
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
              到达或离开指定地点时接收提醒
            </p>
          </div>
          <Switch
            id="location-enabled"
            checked={settings.enabled}
            onCheckedChange={(checked) => handleSettingChange('enabled', checked)}
          />
        </div>

        {settings.enabled && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className="space-y-4 pt-4 border-t"
          >
            {/* Current Location Button */}
            <Button
              type="button"
              variant="outline"
              onClick={getCurrentLocation}
              disabled={isGettingLocation || locationPermission === 'denied'}
              className="w-full border-2 border-dashed border-green-300 hover:border-green-400 hover:bg-green-50"
            >
              {isGettingLocation ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  正在获取位置...
                </>
              ) : settings.latitude && settings.longitude ? (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2 text-green-600" />
                  更新当前位置
                </>
              ) : (
                <>
                  <Navigation className="w-4 h-4 mr-2" />
                  使用当前位置
                </>
              )}
            </Button>

            {locationPermission === 'denied' && (
              <div className="text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-lg p-3">
                ⚠️ 位置权限已被拒绝。请在浏览器设置中允许位置访问。
              </div>
            )}

            {/* Address Display/Input */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">地点</Label>
              <Input
                value={settings.address}
                onChange={(e) => handleSettingChange('address', e.target.value)}
                placeholder="输入地址或地点名称"
                className="border-slate-200"
              />
              {settings.latitude && settings.longitude && (
                <p className="text-xs text-slate-500">
                  坐标: {settings.latitude.toFixed(6)}, {settings.longitude.toFixed(6)}
                </p>
              )}
            </div>

            {/* Radius */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">触发半径</Label>
              <Select
                value={String(settings.radius)}
                onValueChange={(value) => handleSettingChange('radius', parseInt(value))}
              >
                <SelectTrigger className="border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="50">50米</SelectItem>
                  <SelectItem value="100">100米</SelectItem>
                  <SelectItem value="200">200米</SelectItem>
                  <SelectItem value="500">500米</SelectItem>
                  <SelectItem value="1000">1公里</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Trigger Condition */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">触发条件</Label>
              <Select
                value={settings.trigger_on}
                onValueChange={(value) => handleSettingChange('trigger_on', value)}
              >
                <SelectTrigger className="border-slate-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="arrival">到达时提醒</SelectItem>
                  <SelectItem value="departure">离开时提醒</SelectItem>
                  <SelectItem value="both">到达和离开都提醒</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800">
              💡 <strong>提示:</strong> 位置提醒需要您的设备持续允许位置访问。请确保在设备设置中授予必要权限。
            </div>
          </motion.div>
        )}
      </CardContent>
    </Card>
  );
}