import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Coins, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";

export default function InsufficientCreditsDialog({ open, onOpenChange, cost, balance, featureName }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <div className="mx-auto w-14 h-14 rounded-full bg-red-100 flex items-center justify-center mb-2">
            <AlertTriangle className="w-7 h-7 text-red-500" />
          </div>
          <DialogTitle className="text-center">AI 点数不足</DialogTitle>
          <DialogDescription className="text-center">
            使用「{featureName}」需要 <strong>{cost} 点</strong>，<br />
            当前余额仅剩 <strong>{balance} 点</strong>
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <Link to={createPageUrl("Pricing")} onClick={() => onOpenChange(false)}>
            <Button className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white h-11">
              <Coins className="w-4 h-4 mr-2" />
              购买 AI 点数
            </Button>
          </Link>
          <Button variant="outline" className="w-full" onClick={() => onOpenChange(false)}>
            取消
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}