import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation } from "@tanstack/react-query";
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
import { Loader2, Send, MessageSquarePlus } from "lucide-react";
import { toast } from "sonner";

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
        // Don't block success if email fails, but maybe log it
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="w-5 h-5 text-blue-500" />
            联系我们 / 问题反馈
          </DialogTitle>
          <DialogDescription>
            您的意见对我们非常重要。我们会认真阅读每一条反馈，并尽快通过您留下的联系方式回复。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="type">反馈类型</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bug">🐛 问题/Bug反馈</SelectItem>
                <SelectItem value="feature">✨ 功能建议</SelectItem>
                <SelectItem value="other">📮 其他留言</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact">
              联系方式 <span className="text-red-500">*</span>
            </Label>
            <Input
              id="contact"
              placeholder="请输入您的邮箱或电话，方便我们回复"
              value={contactInfo}
              onChange={(e) => setContactInfo(e.target.value)}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="content">
              反馈内容 <span className="text-red-500">*</span>
            </Label>
            <Textarea
              id="content"
              placeholder="请详细描述您遇到的问题或建议..."
              className="h-32 resize-none"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
            取消
          </Button>
          <Button onClick={submitFeedback} disabled={isSubmitting} className="bg-gradient-to-r from-[#384877] to-[#3b5aa2]">
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