import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Sparkles, LogIn, X } from "lucide-react";

export default function RegisterPromptModal({ open, onOpenChange, featureName = "该功能" }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-[#384877] to-[#3b5aa2] flex items-center justify-center mb-3 shadow-lg shadow-[#384877]/20">
            <Sparkles className="w-7 h-7 text-white" />
          </div>
          <DialogTitle className="text-center text-xl">{featureName} 体验次数已用完</DialogTitle>
          <DialogDescription className="text-center pt-2">
            注册账号即可无限次使用，并免费获得 <span className="font-semibold text-[#384877]">200 AI 积分</span>。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Button
            className="w-full bg-gradient-to-r from-[#384877] to-[#3b5aa2] hover:opacity-90"
            onClick={() => { window.location.href = "/login?mode=register"; }}
          >
            免费注册
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => { window.location.href = "/login"; }}
          >
            <LogIn className="w-4 h-4 mr-2" />
            已有账号，去登录
          </Button>
          <button
            onClick={() => onOpenChange(false)}
            className="w-full text-center text-sm text-slate-400 hover:text-slate-600 pt-1 no-min-size"
          >
            稍后再说
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
