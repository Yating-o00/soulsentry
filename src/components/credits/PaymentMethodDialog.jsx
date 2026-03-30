import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Smartphone, Loader2, ExternalLink } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function PaymentMethodDialog({ open, onOpenChange, pack, onPaymentSuccess }) {
  const [loading, setLoading] = useState(null);

  if (!pack) return null;

  const handleStripePayment = async () => {
    setLoading("stripe");
    try {
      const response = await base44.functions.invoke("createStripeCheckout", {
        packId: pack.id,
        packName: pack.name,
        credits: pack.credits,
        price: pack.price,
      });
      if (response.data?.url) {
        window.location.href = response.data.url;
      } else {
        toast.error("创建支付会话失败，请稍后再试");
      }
    } catch (err) {
      toast.error("支付服务暂时不可用: " + (err.message || "未知错误"));
    } finally {
      setLoading(null);
    }
  };

  const handleWechatPayment = async () => {
    setLoading("wechat");
    try {
      const response = await base44.functions.invoke("createWechatOrder", {
        packId: pack.id,
        packName: pack.name,
        credits: pack.credits,
        price: pack.price,
      });

      if (response.data?.demo_mode) {
        toast.info("微信支付功能正在接入中，请先使用 Stripe 支付。订单号：" + response.data.order_no);
      }
    } catch (err) {
      toast.error("微信支付暂不可用: " + (err.message || "未知错误"));
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">选择支付方式</DialogTitle>
          <DialogDescription>
            购买「{pack.name}」 — {pack.credits.toLocaleString()} AI 点数
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 mt-2">
          {/* Stripe */}
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-all border-2 hover:border-[#384877]/50"
            onClick={!loading ? handleStripePayment : undefined}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center flex-shrink-0">
                <CreditCard className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">Stripe 支付</span>
                  <Badge className="bg-emerald-100 text-emerald-700 border-0 text-[10px]">推荐</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">支持信用卡 / 借记卡 / 支付宝</p>
              </div>
              <div className="flex-shrink-0">
                {loading === "stripe" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                ) : (
                  <ExternalLink className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>
          </Card>

          {/* WeChat Pay */}
          <Card
            className="p-4 cursor-pointer hover:shadow-md transition-all border-2 hover:border-emerald-400/50"
            onClick={!loading ? handleWechatPayment : undefined}
          >
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 flex items-center justify-center flex-shrink-0">
                <Smartphone className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900">微信支付</span>
                  <Badge className="bg-amber-100 text-amber-700 border-0 text-[10px]">接入中</Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5">扫码支付 / 微信内支付</p>
              </div>
              <div className="flex-shrink-0">
                {loading === "wechat" ? (
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                ) : (
                  <ExternalLink className="w-4 h-4 text-slate-400" />
                )}
              </div>
            </div>
          </Card>
        </div>

        <div className="mt-3 text-center">
          <p className="text-[11px] text-slate-400">
            金额: <span className="font-semibold text-slate-600">{pack.priceDisplay}</span> · 支付安全由第三方服务保障
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}