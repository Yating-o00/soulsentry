import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { 
  RefreshCw, Check, 
  Clock, Loader2, CalendarPlus, CalendarX
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { cn } from "@/lib/utils";

function GCalIcon({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export default function GoogleCalendarSync({ tasks = [] }) {
  const [syncingTaskId, setSyncingTaskId] = useState(null);
  const [showDialog, setShowDialog] = useState(false);
  const [batchSyncing, setBatchSyncing] = useState(false);
  const queryClient = useQueryClient();

  const syncableTasks = tasks.filter(t => 
    t.reminder_time && !t.deleted_at && t.status !== 'cancelled'
  );
  const syncedTasks = syncableTasks.filter(t => t.google_calendar_event_id);
  const unsyncedTasks = syncableTasks.filter(t => !t.google_calendar_event_id);

  const handleSyncSingle = async (task) => {
    setSyncingTaskId(task.id);
    try {
      await base44.functions.invoke('syncTaskToGoogleCalendar', { task_id: task.id });
      toast.success(`已同步「${task.title}」到 Google Calendar`, { icon: '📅' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      toast.error(`同步失败: ${err.response?.data?.error || err.message}`);
    } finally {
      setSyncingTaskId(null);
    }
  };

  const handleUnsync = async (task) => {
    setSyncingTaskId(task.id);
    try {
      await base44.functions.invoke('syncTaskToGoogleCalendar', { task_id: task.id, action: 'delete' });
      toast.success(`已从 Google Calendar 移除「${task.title}」`);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      toast.error(`取消同步失败: ${err.response?.data?.error || err.message}`);
    } finally {
      setSyncingTaskId(null);
    }
  };

  const handleBatchSync = async () => {
    setBatchSyncing(true);
    const toastId = toast.loading("正在同步到 Google Calendar...");
    let cursor = 0;
    let totalSynced = 0;
    let totalFailed = 0;
    let safety = 50; // 最多 50 批，避免极端情况下死循环
    try {
      while (safety-- > 0) {
        const res = await base44.functions.invoke('bulkSyncTasksToCalendar', {
          batch_size: 15,
          cursor,
          only_unsynced: true,
        });
        const d = res.data || {};
        totalSynced += d.synced || 0;
        totalFailed += d.failed || 0;
        cursor = d.cursor || cursor;
        toast.loading(`已同步 ${totalSynced} 个约定…`, { id: toastId });
        if (d.done) break;
      }
      toast.success(`完成！已同步 ${totalSynced} 个约定到 Google Calendar`, { id: toastId, icon: '📅' });
      if (totalFailed > 0) toast.error(`${totalFailed} 个约定同步失败`);
    } catch (err) {
      toast.error(`同步失败: ${err.response?.data?.error || err.message}`, { id: toastId });
    } finally {
      setBatchSyncing(false);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    }
  };

  const handleEnableAutoSync = async (task) => {
    setSyncingTaskId(task.id);
    try {
      await base44.entities.Task.update(task.id, { gcal_sync_enabled: true });
      await base44.functions.invoke('syncTaskToGoogleCalendar', { task_id: task.id });
      toast.success(`已开启「${task.title}」的自动同步`, { icon: '🔄' });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    } catch (err) {
      toast.error(`操作失败: ${err.response?.data?.error || err.message}`);
    } finally {
      setSyncingTaskId(null);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setShowDialog(true)}
        className="rounded-xl h-9 px-3 gap-2 text-xs border-slate-200 hover:border-[#384877]/30 hover:text-[#384877]"
      >
        <div className="w-4 h-4 relative">
          <GCalIcon className="w-4 h-4 text-[#4285f4]" />
          {syncedTasks.length > 0 && (
            <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full" />
          )}
        </div>
        <span className="hidden md:inline">Google 日历</span>
        <span className="text-slate-400">{syncedTasks.length}/{syncableTasks.length}</span>
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-lg max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-[#4285f4] to-[#34a853] flex items-center justify-center">
                <GCalIcon className="w-4 h-4 text-white" />
              </div>
              Google Calendar 同步
            </DialogTitle>
            <DialogDescription>
              双向同步约定与 Google Calendar 事件，修改任一端时间会自动更新另一端
            </DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
            <div className="flex-1 text-center">
              <div className="text-lg font-bold text-[#384877]">{syncedTasks.length}</div>
              <div className="text-[10px] text-slate-500">已同步</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="flex-1 text-center">
              <div className="text-lg font-bold text-slate-600">{unsyncedTasks.length}</div>
              <div className="text-[10px] text-slate-500">未同步</div>
            </div>
            <div className="w-px h-8 bg-slate-200" />
            <div className="flex-1 text-center">
              <div className="text-lg font-bold text-green-600">
                {syncableTasks.filter(t => t.gcal_sync_enabled).length}
              </div>
              <div className="text-[10px] text-slate-500">自动同步</div>
            </div>
          </div>

          {unsyncedTasks.length > 0 && (
            <Button
              onClick={handleBatchSync}
              disabled={batchSyncing}
              className="bg-[#384877] hover:bg-[#2d3a5f] text-white rounded-xl gap-2"
            >
              {batchSyncing ? (
                <><Loader2 className="w-4 h-4 animate-spin" />正在批量同步...</>
              ) : (
                <><CalendarPlus className="w-4 h-4" />一键同步 {unsyncedTasks.length} 个约定</>
              )}
            </Button>
          )}

          <div className="flex-1 overflow-y-auto space-y-2 pr-1 -mr-1">
            {syncableTasks.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-sm">
                暂无可同步的约定（需要设置提醒时间）
              </div>
            ) : (
              syncableTasks.map(task => {
                const isSynced = !!task.google_calendar_event_id;
                const isAutoSync = task.gcal_sync_enabled;
                const isLoading = syncingTaskId === task.id;
                
                return (
                  <div 
                    key={task.id} 
                    className={cn(
                      "p-3 rounded-xl border transition-all",
                      isSynced ? "bg-green-50/50 border-green-100" : "bg-white border-slate-100 hover:border-slate-200"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className={cn(
                        "w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5",
                        isSynced ? "bg-green-100" : "bg-slate-100"
                      )}>
                        {isSynced ? <Check className="w-4 h-4 text-green-600" /> : <CalendarPlus className="w-4 h-4 text-slate-400" />}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                          <h4 className="font-medium text-sm text-slate-800 truncate">{task.title}</h4>
                          {isAutoSync && (
                            <span className="px-1.5 py-0.5 bg-blue-50 text-blue-600 text-[10px] rounded-md border border-blue-100 shrink-0">
                              自动
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock className="w-3 h-3" />
                          {format(new Date(task.reminder_time), 'M月d日 HH:mm', { locale: zhCN })}
                          {task.end_time && <span>→ {format(new Date(task.end_time), 'HH:mm')}</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        {isSynced ? (
                          <Button variant="ghost" size="sm" onClick={() => handleUnsync(task)} disabled={isLoading}
                            className="h-7 px-2 text-xs text-red-500 hover:text-red-600 hover:bg-red-50">
                            {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarX className="w-3 h-3" />}
                            <span className="ml-1 hidden sm:inline">取消</span>
                          </Button>
                        ) : (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => handleEnableAutoSync(task)} disabled={isLoading}
                              className="h-7 px-2 text-xs text-[#384877] hover:bg-[#384877]/5">
                              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                              <span className="ml-1 hidden sm:inline">自动</span>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleSyncSingle(task)} disabled={isLoading}
                              className="h-7 px-2 text-xs text-green-600 hover:bg-green-50">
                              {isLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <CalendarPlus className="w-3 h-3" />}
                              <span className="ml-1 hidden sm:inline">同步</span>
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="pt-2 border-t border-slate-100 text-[11px] text-slate-400 flex items-center gap-1.5">
            <RefreshCw className="w-3 h-3" />
            开启「自动同步」后，修改约定时间将实时更新到 Google Calendar
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}