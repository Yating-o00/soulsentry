import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Bell, Plus, Trash2, Volume2, BellOff, Settings, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";

const CATEGORIES = [
  { value: "all", label: "所有分类" },
  { value: "work", label: "工作" },
  { value: "personal", label: "个人" },
  { value: "health", label: "健康" },
  { value: "study", label: "学习" },
  { value: "family", label: "家庭" },
  { value: "shopping", label: "购物" },
  { value: "finance", label: "财务" },
  { value: "other", label: "其他" },
];

const PRIORITIES = [
  { value: "all", label: "所有优先级" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
  { value: "urgent", label: "紧急" },
];

const SOUNDS = [
  { value: "default", label: "默认" },
  { value: "gentle", label: "轻柔" },
  { value: "urgent", label: "紧急" },
  { value: "chime", label: "铃声" },
  { value: "bells", label: "钟声" },
  { value: "none", label: "无声" },
];

export default function NotificationSettingsPage() {
  const queryClient = useQueryClient();
  const [showAddRule, setShowAddRule] = useState(false);
  const [permission, setPermission] = useState(Notification.permission);
  
  const [newRule, setNewRule] = useState({
    title: "",
    condition_category: "all",
    condition_priority: "all",
    action_mute: false,
    action_sound: "default",
    is_enabled: true
  });

  const { data: rules = [] } = useQuery({
    queryKey: ['notificationRules'],
    queryFn: () => base44.entities.NotificationRule.list(),
  });

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me(),
  });

  const updateDNDMutation = useMutation({
    mutationFn: (dndSettings) => base44.auth.updateMe({ dnd_settings: dndSettings }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['currentUser'] });
      toast.success("免打扰设置已更新");
    }
  });

  const updateCategorySoundMutation = useMutation({
    mutationFn: async ({ category, sound }) => {
      // Find existing rule for this category (priority 'all')
      const existingRule = rules.find(r => 
        r.condition_category === category && 
        r.condition_priority === 'all'
      );

      if (existingRule) {
        if (sound === 'default') {
           // If setting to default, maybe delete the rule? Or just set sound to default. 
           // Let's delete the rule to keep it clean if it's just a sound rule.
           return base44.entities.NotificationRule.delete(existingRule.id);
        }
        return base44.entities.NotificationRule.update(existingRule.id, { action_sound: sound });
      } else {
        if (sound === 'default') return; // Nothing to do
        return base44.entities.NotificationRule.create({
          title: `${CATEGORIES.find(c => c.value === category)?.label || category} 默认提示音`,
          condition_category: category,
          condition_priority: 'all',
          action_sound: sound,
          is_enabled: true
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationRules'] });
      toast.success("提示音已更新");
    }
  });

  const createRuleMutation = useMutation({
    mutationFn: (data) => base44.entities.NotificationRule.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationRules'] });
      setShowAddRule(false);
      setNewRule({
        title: "",
        condition_category: "all",
        condition_priority: "all",
        action_mute: false,
        action_sound: "default",
        is_enabled: true
      });
      toast.success("规则创建成功");
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id) => base44.entities.NotificationRule.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationRules'] });
      toast.success("规则已删除");
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: ({ id, is_enabled }) => base44.entities.NotificationRule.update(id, { is_enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notificationRules'] });
    },
  });

  const requestPermission = async () => {
    const result = await Notification.requestPermission();
    setPermission(result);
    if (result === 'granted') {
      toast.success("通知权限已开启");
    } else {
      toast.error("通知权限被拒绝");
    }
  };

  const handleCreateRule = () => {
    if (!newRule.title.trim()) {
      toast.error("请输入规则名称");
      return;
    }
    createRuleMutation.mutate(newRule);
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-8">
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h1 className="text-3xl font-bold bg-gradient-to-r from-[#384877] to-[#3b5aa2] bg-clip-text text-transparent mb-2">
          通知设置
        </h1>
        <p className="text-slate-600">自定义您的约定提醒方式和通知规则</p>
      </motion.div>

      {/* Permission Card */}
      <Card className="border-0 shadow-lg bg-white">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-xl ${permission === 'granted' ? 'bg-green-100' : 'bg-amber-100'}`}>
                <Bell className={`w-6 h-6 ${permission === 'granted' ? 'text-green-600' : 'text-amber-600'}`} />
              </div>
              <div>
                <CardTitle className="text-lg">浏览器推送通知</CardTitle>
                <CardDescription>
                  {permission === 'granted' 
                    ? "您的设备已开启通知权限，可以正常接收提醒" 
                    : "需要开启权限才能接收约定提醒通知"}
                </CardDescription>
              </div>
            </div>
            {permission !== 'granted' && (
              <Button onClick={requestPermission}>开启权限</Button>
            )}
            {permission === 'granted' && (
               <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">已开启</Badge>
            )}
          </div>
        </CardHeader>
      </Card>

      {/* DND & Category Sounds Grid */}
      <div className="grid md:grid-cols-2 gap-6">
          {/* Do Not Disturb Section */}
          <Card className="border-0 shadow-lg bg-white h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <BellOff className="w-5 h-5 text-purple-500" />
                免打扰时段
              </CardTitle>
              <CardDescription>
                设置不接收任何通知的时间段
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between mb-4">
                <div className="space-y-0.5">
                  <Label className="text-base">启用免打扰</Label>
                  <p className="text-sm text-slate-500">指定时间段内自动静音</p>
                </div>
                <Switch
                  checked={currentUser?.dnd_settings?.enabled || false}
                  onCheckedChange={(checked) => {
                    updateDNDMutation.mutate({
                      ...currentUser?.dnd_settings,
                      enabled: checked,
                      start_time: currentUser?.dnd_settings?.start_time || "22:00",
                      end_time: currentUser?.dnd_settings?.end_time || "08:00"
                    });
                  }}
                />
              </div>
              
              {currentUser?.dnd_settings?.enabled && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="grid grid-cols-2 gap-4 pt-4 border-t"
                >
                  <div className="space-y-2">
                    <Label>开始时间</Label>
                    <Input
                      type="time"
                      value={currentUser?.dnd_settings?.start_time || "22:00"}
                      onChange={(e) => updateDNDMutation.mutate({
                        ...currentUser?.dnd_settings,
                        start_time: e.target.value
                      })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>结束时间</Label>
                    <Input
                      type="time"
                      value={currentUser?.dnd_settings?.end_time || "08:00"}
                      onChange={(e) => updateDNDMutation.mutate({
                        ...currentUser?.dnd_settings,
                        end_time: e.target.value
                      })}
                    />
                  </div>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Category Sounds Section */}
          <Card className="border-0 shadow-lg bg-white h-full">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Volume2 className="w-5 h-5 text-blue-500" />
                分类提示音
              </CardTitle>
              <CardDescription>
                为不同类型的约定设置专属提示音
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                {CATEGORIES.filter(c => c.value !== 'all').map(category => {
                    const rule = rules.find(r => r.condition_category === category.value && r.condition_priority === 'all');
                    const currentSound = rule?.action_sound || 'default';
                    
                    return (
                        <div key={category.value} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50">
                            <span className="text-sm font-medium text-slate-700">{category.label}</span>
                            <Select
                                value={currentSound}
                                onValueChange={(val) => updateCategorySoundMutation.mutate({ category: category.value, sound: val })}
                            >
                                <SelectTrigger className="w-[120px] h-8 text-xs">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {SOUNDS.map(s => (
                                        <SelectItem key={s.value} value={s.value} className="text-xs">
                                            {s.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    );
                })}
            </CardContent>
          </Card>
      </div>

      {/* Rules Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-slate-800 flex items-center gap-2">
            <Settings className="w-5 h-5 text-[#384877]" />
            高级通知规则
          </h2>
          <Button onClick={() => setShowAddRule(!showAddRule)} variant={showAddRule ? "secondary" : "default"} className="bg-[#384877] hover:bg-[#2c3b63] text-white">
            <Plus className="w-4 h-4 mr-2" />
            新建规则
          </Button>
        </div>

        <AnimatePresence>
          {showAddRule && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden"
            >
              <Card className="border-2 border-[#384877]/20 bg-slate-50">
                <CardContent className="pt-6 space-y-6">
                  <div className="space-y-2">
                    <Label>规则名称</Label>
                    <Input 
                      placeholder="例如：紧急工作约定提醒" 
                      value={newRule.title}
                      onChange={(e) => setNewRule({...newRule, title: e.target.value})}
                      className="bg-white"
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4 p-4 bg-white rounded-xl border border-slate-200">
                      <h3 className="font-medium text-slate-900 flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-500" />
                        触发条件
                      </h3>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs text-slate-500">当约定分类为</Label>
                          <Select 
                            value={newRule.condition_category} 
                            onValueChange={(val) => setNewRule({...newRule, condition_category: val})}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label className="text-xs text-slate-500">且优先级为</Label>
                          <Select 
                            value={newRule.condition_priority} 
                            onValueChange={(val) => setNewRule({...newRule, condition_priority: val})}
                          >
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-4 p-4 bg-white rounded-xl border border-slate-200">
                      <h3 className="font-medium text-slate-900 flex items-center gap-2">
                        <Bell className="w-4 h-4 text-orange-500" />
                        执行动作
                      </h3>
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>静音通知</Label>
                            <p className="text-xs text-slate-500">不发送弹窗和声音</p>
                          </div>
                          <Switch 
                            checked={newRule.action_mute}
                            onCheckedChange={(checked) => setNewRule({...newRule, action_mute: checked})}
                          />
                        </div>

                        {!newRule.action_mute && (
                          <div className="space-y-1.5">
                            <Label className="text-xs text-slate-500">使用提示音</Label>
                            <Select 
                              value={newRule.action_sound} 
                              onValueChange={(val) => setNewRule({...newRule, action_sound: val})}
                            >
                              <SelectTrigger><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {SOUNDS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="ghost" onClick={() => setShowAddRule(false)}>取消</Button>
                    <Button onClick={handleCreateRule} className="bg-[#384877] hover:bg-[#2c3b63] text-white">保存规则</Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid gap-4">
          {rules.map((rule) => (
            <motion.div
              key={rule.id}
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
            >
              <Card className="hover:shadow-md transition-shadow">
                <CardContent className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`p-2.5 rounded-full ${rule.is_enabled ? 'bg-blue-50' : 'bg-slate-100'}`}>
                      {rule.action_mute ? (
                        <BellOff className={`w-5 h-5 ${rule.is_enabled ? 'text-slate-500' : 'text-slate-400'}`} />
                      ) : (
                        <Volume2 className={`w-5 h-5 ${rule.is_enabled ? 'text-blue-600' : 'text-slate-400'}`} />
                      )}
                    </div>
                    <div>
                      <h3 className={`font-semibold ${rule.is_enabled ? 'text-slate-800' : 'text-slate-400'}`}>
                        {rule.title}
                      </h3>
                      <div className="flex gap-2 text-sm text-slate-500 mt-1">
                        <Badge variant="secondary" className="text-xs font-normal">
                          {CATEGORIES.find(c => c.value === rule.condition_category)?.label}
                        </Badge>
                        <Badge variant="secondary" className="text-xs font-normal">
                          {PRIORITIES.find(p => p.value === rule.condition_priority)?.label}
                        </Badge>
                        <span className="text-slate-300">→</span>
                        {rule.action_mute ? (
                          <span className="text-slate-500">静音</span>
                        ) : (
                          <span className="text-slate-500">
                            音效: {SOUNDS.find(s => s.value === rule.action_sound)?.label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <Label htmlFor={`rule-${rule.id}`} className="text-xs text-slate-400 cursor-pointer">
                        {rule.is_enabled ? "已启用" : "已禁用"}
                      </Label>
                      <Switch 
                        id={`rule-${rule.id}`}
                        checked={rule.is_enabled}
                        onCheckedChange={(checked) => toggleRuleMutation.mutate({ id: rule.id, is_enabled: checked })}
                      />
                    </div>
                    <Button 
                      size="icon" 
                      variant="ghost" 
                      onClick={() => deleteRuleMutation.mutate(rule.id)}
                      className="text-slate-400 hover:text-red-500 hover:bg-red-50"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}

          {rules.length === 0 && !showAddRule && (
            <div className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200">
              <Settings className="w-12 h-12 mx-auto text-slate-300 mb-3" />
              <h3 className="text-slate-500 font-medium">暂无自定义规则</h3>
              <p className="text-slate-400 text-sm mt-1 mb-4">创建规则来个性化您的通知体验</p>
              <Button onClick={() => setShowAddRule(true)} variant="outline">创建第一条规则</Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}