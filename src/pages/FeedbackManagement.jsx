import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Loader2, Mail, CheckCircle2, AlertCircle, MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";

export default function FeedbackManagement() {
  const [selectedFeedback, setSelectedFeedback] = useState(null);
  const [replyContent, setReplyContent] = useState("");
  const [sendEmail, setSendEmail] = useState(true);
  const [statusFilter, setStatusFilter] = useState("all");
  
  const queryClient = useQueryClient();

  const { data: feedbacks = [], isLoading } = useQuery({
    queryKey: ['feedbacks'],
    queryFn: () => base44.entities.Feedback.list('-created_date'),
  });

  const updateFeedbackMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.Feedback.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedbacks'] });
      toast.success("状态已更新");
    },
  });

  const replyMutation = useMutation({
    mutationFn: async ({ id, reply, shouldSendEmail, contactInfo }) => {
      // 1. Update DB
      await base44.entities.Feedback.update(id, {
        admin_reply: reply,
        status: 'resolved', // Auto resolve on reply? Or keep as processing? Let's verify with user. User said "allow admin to update status", so maybe auto-resolve or let them choose. I'll default to 'resolved' if they reply, but let them change it back if needed. Or just update reply field.
        // Actually, usually replying implies processing or resolving. Let's just update reply first.
        // But the requirement says "reply content can be chosen to be sent via email".
      });

      // 2. Send Email if requested
      if (shouldSendEmail && contactInfo) {
        // Simple validation of email
        if (contactInfo.includes('@')) {
          await base44.integrations.Core.SendEmail({
            to: contactInfo,
            subject: "【心灵存放站】关于您反馈的回复",
            body: `
您好，收到您的反馈：
----------------
${selectedFeedback.content}
----------------

我们的回复：
${reply}

感谢您的支持！
            `
          });
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['feedbacks'] });
      toast.success("回复已发送");
      setSelectedFeedback(null);
      setReplyContent("");
    },
    onError: (err) => {
      toast.error("操作失败: " + err.message);
    }
  });

  const handleStatusChange = (id, newStatus) => {
    updateFeedbackMutation.mutate({ id, data: { status: newStatus } });
  };

  const handleReplySubmit = () => {
    if (!replyContent.trim()) return;
    replyMutation.mutate({
      id: selectedFeedback.id,
      reply: replyContent,
      shouldSendEmail: sendEmail,
      contactInfo: selectedFeedback.contact_info
    });
  };

  const filteredFeedbacks = feedbacks.filter(f => statusFilter === "all" || f.status === statusFilter);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'pending': return <Badge variant="outline" className="text-yellow-600 border-yellow-200 bg-yellow-50">待处理</Badge>;
      case 'processing': return <Badge variant="outline" className="text-blue-600 border-blue-200 bg-blue-50">处理中</Badge>;
      case 'resolved': return <Badge variant="outline" className="text-green-600 border-green-200 bg-green-50">已解决</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">反馈管理</h1>
          <p className="text-slate-500 text-sm mt-1">查看和处理用户反馈</p>
        </div>
        <div className="w-[200px]">
           <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="状态筛选" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="pending">待处理</SelectItem>
              <SelectItem value="processing">处理中</SelectItem>
              <SelectItem value="resolved">已解决</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">时间</TableHead>
                <TableHead className="w-[100px]">类型</TableHead>
                <TableHead className="max-w-[300px]">内容摘要</TableHead>
                <TableHead>联系方式</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    加载中...
                  </TableCell>
                </TableRow>
              ) : filteredFeedbacks.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-slate-500">
                    暂无相关反馈
                  </TableCell>
                </TableRow>
              ) : (
                filteredFeedbacks.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-slate-500 text-xs">
                      {format(new Date(item.created_date), "yyyy-MM-dd HH:mm", { locale: zhCN })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="text-xs">
                        {item.type === 'bug' ? 'Bug' : item.type === 'feature' ? '建议' : '留言'}
                      </Badge>
                    </TableCell>
                    <TableCell className="truncate max-w-[300px]" title={item.content}>
                      {item.content}
                    </TableCell>
                    <TableCell className="text-sm font-mono text-slate-600">
                      {item.contact_info}
                    </TableCell>
                    <TableCell>
                      <Select 
                        defaultValue={item.status} 
                        onValueChange={(val) => handleStatusChange(item.id, val)}
                      >
                         <SelectTrigger className="h-7 w-[100px] text-xs border-none shadow-none bg-transparent p-0 hover:bg-slate-50">
                           {getStatusBadge(item.status)}
                         </SelectTrigger>
                         <SelectContent>
                           <SelectItem value="pending">待处理</SelectItem>
                           <SelectItem value="processing">处理中</SelectItem>
                           <SelectItem value="resolved">已解决</SelectItem>
                         </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                        onClick={() => {
                          setSelectedFeedback(item);
                          setReplyContent(item.admin_reply || "");
                        }}
                      >
                        <MessageSquare className="w-4 h-4 mr-1" />
                        详情/回复
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!selectedFeedback} onOpenChange={(open) => !open && setSelectedFeedback(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>反馈详情</DialogTitle>
          </DialogHeader>
          {selectedFeedback && (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-lg space-y-2 text-sm">
                <div className="flex justify-between text-slate-500 text-xs">
                  <span>{format(new Date(selectedFeedback.created_date), "yyyy-MM-dd HH:mm:ss")}</span>
                  <span>联系: {selectedFeedback.contact_info}</span>
                </div>
                <div className="font-medium text-slate-800 whitespace-pre-wrap">
                  {selectedFeedback.content}
                </div>
              </div>

              <div className="space-y-2">
                <Label>管理员回复</Label>
                <Textarea 
                  value={replyContent} 
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="输入回复内容..."
                  className="min-h-[100px]"
                />
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox 
                  id="sendEmail" 
                  checked={sendEmail} 
                  onCheckedChange={setSendEmail}
                />
                <Label htmlFor="sendEmail" className="text-sm font-normal text-slate-600 cursor-pointer">
                  通过邮件发送回复 ({selectedFeedback.contact_info})
                </Label>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedFeedback(null)}>关闭</Button>
                <Button 
                  onClick={handleReplySubmit} 
                  disabled={replyMutation.isPending}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  {replyMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  <Send className="w-4 h-4 mr-2" />
                  保存并发送
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}