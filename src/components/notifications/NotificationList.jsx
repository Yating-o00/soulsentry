import React from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, Check, Trash2, ExternalLink, MessageSquare, UserPlus, Info, CheckCircle2 } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "react-router-dom";

export default function NotificationList({ limit = 20, showHeader = true }) {
  const queryClient = useQueryClient();

  const { data: currentUser } = useQuery({
    queryKey: ['currentUser'],
    queryFn: () => base44.auth.me()
  });

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      if (!currentUser?.id) return [];
      return base44.entities.Notification.filter({ recipient_id: currentUser.id }, "-created_date", limit);
    },
    enabled: !!currentUser?.id
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { is_read: true }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      const unread = notifications.filter(n => !n.is_read);
      for (const n of unread) {
        await base44.entities.Notification.update(n.id, { is_read: true });
      }
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.delete(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] })
  });

  const getIcon = (type) => {
    switch (type) {
      case 'assignment': return <UserPlus className="w-5 h-5 text-blue-500" />;
      case 'comment': return <MessageSquare className="w-5 h-5 text-green-500" />;
      case 'mention': return <Info className="w-5 h-5 text-purple-500" />;
      case 'reminder': return <Bell className="w-5 h-5 text-orange-500" />;
      case 'system': return <Info className="w-5 h-5 text-slate-500" />;
      default: return <Bell className="w-5 h-5 text-slate-500" />;
    }
  };

  const unreadCount = notifications.filter(n => !n.is_read).length;

  if (isLoading) return <div className="p-8 text-center text-slate-500">加载通知中...</div>;

  return (
    <div className="space-y-4">
      {showHeader && (
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Bell className="w-5 h-5" />
            通知中心
            {unreadCount > 0 && (
              <Badge className="bg-red-500 hover:bg-red-600 border-0">{unreadCount}</Badge>
            )}
          </h2>
          {unreadCount > 0 && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => markAllReadMutation.mutate()}
              className="text-xs"
            >
              <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
              全部已读
            </Button>
          )}
        </div>
      )}

      <div className="space-y-3">
        <AnimatePresence mode="popLayout">
          {notifications.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-12 bg-slate-50 rounded-xl border border-dashed border-slate-200"
            >
              <Bell className="w-10 h-10 mx-auto mb-3 text-slate-300" />
              <p className="text-slate-500">暂无通知</p>
            </motion.div>
          ) : (
            notifications.map((notification) => (
              <motion.div
                key={notification.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className={`relative p-4 rounded-xl border transition-all hover:shadow-md ${
                  notification.is_read 
                    ? "bg-white border-slate-100" 
                    : "bg-blue-50/50 border-blue-100 shadow-sm"
                }`}
              >
                {!notification.is_read && (
                  <div className="absolute top-4 right-4 w-2 h-2 rounded-full bg-blue-500" />
                )}
                
                <div className="flex gap-4">
                  <div className={`mt-1 p-2 rounded-lg ${notification.is_read ? 'bg-slate-50' : 'bg-white shadow-sm'}`}>
                    {getIcon(notification.type)}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start mb-1 pr-4">
                      <h4 className={`font-medium text-sm ${notification.is_read ? 'text-slate-700' : 'text-slate-900'}`}>
                        {notification.title}
                      </h4>
                      <span className="text-xs text-slate-400 whitespace-nowrap ml-2">
                        {format(new Date(notification.created_date), "MM-dd HH:mm", { locale: zhCN })}
                      </span>
                    </div>
                    
                    <p className="text-sm text-slate-600 mb-3 leading-relaxed">
                      {notification.content}
                    </p>
                    
                    <div className="flex items-center gap-2">
                      {notification.link && (
                        <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                          <Link to={notification.link}>
                            查看详情 <ExternalLink className="w-3 h-3 ml-1" />
                          </Link>
                        </Button>
                      )}
                      
                      {!notification.is_read && (
                        <Button 
                          variant="ghost" 
                          size="sm" 
                          onClick={() => markReadMutation.mutate(notification.id)}
                          className="h-7 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Check className="w-3 h-3 mr-1" />
                          标为已读
                        </Button>
                      )}
                      
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => deleteMutation.mutate(notification.id)}
                        className="h-7 text-xs text-slate-400 hover:text-red-500 hover:bg-red-50 ml-auto"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}