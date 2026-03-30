import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Coins, Plus, Minus, Gift, RotateCcw } from "lucide-react";
import { AI_FEATURES } from "./creditConfig";

const TYPE_CONFIG = {
  purchase: { label: "购买", icon: Plus, color: "text-green-600 bg-green-50" },
  consume: { label: "消耗", icon: Minus, color: "text-red-600 bg-red-50" },
  gift: { label: "赠送", icon: Gift, color: "text-purple-600 bg-purple-50" },
  refund: { label: "退还", icon: RotateCcw, color: "text-blue-600 bg-blue-50" },
  subscription_bonus: { label: "订阅奖励", icon: Coins, color: "text-amber-600 bg-amber-50" },
};

export default function CreditHistoryDialog({ open, onOpenChange }) {
  const { data: transactions = [], isLoading } = useQuery({
    queryKey: ["credit-history"],
    queryFn: () => base44.entities.AICreditTransaction.list("-created_date", 50),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-amber-600" />
            点数明细
          </DialogTitle>
        </DialogHeader>
        <ScrollArea className="h-[400px] pr-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500" />
            </div>
          ) : transactions.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Coins className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p>暂无交易记录</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.map((tx) => {
                const config = TYPE_CONFIG[tx.type] || TYPE_CONFIG.consume;
                const Icon = config.icon;
                const featureName = tx.feature ? (AI_FEATURES[tx.feature]?.name || tx.feature) : null;
                return (
                  <div key={tx.id} className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${config.color}`}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-800 truncate">
                        {tx.description || featureName || config.label}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {new Date(tx.created_date).toLocaleString("zh-CN")}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${tx.amount > 0 ? "text-green-600" : "text-red-500"}`}>
                        {tx.amount > 0 ? "+" : ""}{tx.amount}
                      </p>
                      {tx.balance_after != null && (
                        <p className="text-[11px] text-slate-400">余额 {tx.balance_after}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}