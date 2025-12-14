import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Send, MessageSquarePlus, Sparkles, Bug, Mail, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function FeedbackDialog({ open, onOpenChange }) {
  const [type, setType] = useState("feature");
  const [content, setContent] = useState("");
  const [contactInfo, setContactInfo] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const submitFeedback = async () => {
    if (!content.trim() || !contactInfo.trim()) {
      toast.error("请填写反馈内容和联系方式");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Save to Database
      await base44.entities.Feedback.create({
        type,
        content,
        contact_info: contactInfo,
        status: "pending"
      });

      // 2. Send Email Notification
      try {
        const currentUser = await base44.auth.me().catch(() => ({ email: 'Anonymous' }));
        const emailBody = `
新用户反馈 (${type})
------------------------
用户: ${currentUser?.email || '未登录用户'}
联系方式: ${contactInfo}

内容:
${content}
        `;
        
        await base44.integrations.Core.SendEmail({
          to: "dengyating0330@gmail.com",
          subject: `[心灵存放站反馈] ${type} - ${contactInfo}`,
          body: emailBody
        });
      } catch (emailError) {
        console.error("Failed to send email notification", emailError);
      }

      toast.success("反馈已提交，我们会尽快联系您！");
      onOpenChange(false);
      setContent("");
      setContactInfo("");
      setType("feature");
    } catch (error) {
      console.error(error);
      toast.error("提交失败，请稍后重试");
    } finally {
      setIsSubmitting(false);
    }
  };

  const getTypeIcon = (t) => {
    switch(t) {
      case 'bug': return <Bug className="w-4 h-4 text-red-500" />;
      case 'feature': return <Sparkles className="w-4 h-4 text-amber-500" />;
      default: return <MessageCircle className="w-4 h-4 text-blue-500" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-0 shadow-2xl bg-white/95 backdrop-blur-sm">
        <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-[#384877] to-[#3b5aa2]" />
        
        <DialogHeader className="p-6 pb-2">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center shadow-lg shadow-[#384877]/20">
              <MessageSquarePlus className="w-5 h-5 text-white" />
            </div>
            <div>
              <DialogTitle className="text-xl font-bold text-[#222222]">
                反馈与联系
              </DialogTitle>
              <DialogDescription className="text-slate-500 text-xs mt-1">
                您的声音能帮助我们做得更好
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 py-4 space-y-5">
          <div className="space-y-2">
            <Label htmlFor="type" className="text-sm font-semibold text-slate-700">反馈类型</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger className="border-slate-200 hover:border-blue-300 transition-colors h-11 rounded-xl bg-slate-50/50">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">
                  <div className="flex items-center gap-2">
                    <Bug className="w-4 h-4 text-red-500" />
                    <span>问题/Bug反馈</span>
                  </div>
                </SelectItem>
                <SelectItem value="feature">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <span>功能建议</span>
                  </div>
                </SelectItem>
                <SelectItem value="other">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-blue-500" />
                    <span>其他留言</span>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="contact" className="text-sm font-semibold text-slate-700 flex items-center gap-1">
              联系方式 <span className="text-[#d5495f]">*</span>
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
              <Input
                id="contact"
                placeholder="请输入邮箱或电话"
                value={contactInfo}
                onChange={(e) => setContactInfo(e.target.value)}
                className="pl-9 border-slate-200 hover:border-blue-300 focus-visible:ring-[#384877] transition-all h-11 rounded-xl bg-slate-50/50"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="content" className="text-sm font-semibold text-slate-700 flex items-center gap-1">
              {type === 'bug' ? '问题描述' : type === 'feature' ? '建议详情' : '留言内容'} 
              <span className="text-[#d5495f]">*</span>
            </Label>
            <Textarea
              id="content"
              placeholder={type === 'bug' ? "请描述您遇到的问题，发生场景等..." : "请详细描述您的建议..."}
              className="min-h-[120px] resize-none border-slate-200 hover:border-blue-300 focus-visible:ring-[#384877] transition-all rounded-xl bg-slate-50/50 p-3"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter className="p-6 pt-2 bg-slate-50/50 border-t border-slate-100 flex gap-3">
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)} 
            disabled={isSubmitting}
            className="rounded-xl hover:bg-slate-200/50 text-slate-600"
          >
            取消
          </Button>
          <Button 
            onClick={submitFeedback} 
            disabled={isSubmitting} 
            className="rounded-xl bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:from-[#2c3b63] hover:to-[#2a4585] text-white shadow-lg shadow-[#384877]/20 px-6 transition-all"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                提交中...
              </>
            ) : (
              <>
                <Send className="mr-2 h-4 w-4" />
                发送反馈
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}