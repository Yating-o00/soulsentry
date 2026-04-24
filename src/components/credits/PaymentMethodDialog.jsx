import React, { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Smartphone, Loader2, ExternalLink, QrCode, ArrowLeft, CheckCircle2 } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

export default function PaymentMethodDialog({ open, onOpenChange, pack, onPaymentSuccess }) {
  const [loading, setLoading] = useState(null);
  const [wechatQR, setWechatQR] = useState(null); // { code_url, order_no }
  const [paid, setPaid] = useState(false);
  const pollTimerRef = useRef(null);

  // 支付成功后自动关闭弹窗
  useEffect(() => {
    if (!paid) return;
    const t = setTimeout(() => {
      setWechatQR(null);
      setPaid(false);
      onOpenChange?.(false);
      onPaymentSuccess?.();
    }, 1800);
    return () => clearTimeout(t);
  }, [paid, onOpenChange, onPaymentSuccess]);

  // 轮询订单状态
  useEffect(() => {
    if (!wechatQR?.order_no || paid) return;
    let stopped = false;
    const poll = async () => {
      try {
        const res = await base44.functions.invoke("queryWechatOrder", { order_no: wechatQR.order_no });
        if (!stopped && res.data?.paid) {
          setPaid(true);
          toast.success("支付成功！点数已到账");
          return;
        }
      } catch (e) {
        // 忽略单次失败，继续轮询
      }
      if (!stopped) {
        pollTimerRef.current = setTimeout(poll, 3000);
      }
    };
    pollTimerRef.current = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    };
  }, [wechatQR, paid]);

  // 关闭弹窗时重置状态
  useEffect(() => {
    if (!open) {
      setWechatQR(null);
      setPaid(false);
      if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    }
  }, [open]);

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

      if (response.data?.code_url) {
        setWechatQR({ code_url: response.data.code_url, order_no: response.data.order_no });
      } else {
        toast.error(response.data?.error || "微信支付下单失败");
      }
    } catch (err) {
      toast.error("微信支付暂不可用: " + (err.message || "未知错误"));
    } finally {
      setLoading(null);
    }
  };

  const handleBackToMethods = () => {
    setWechatQR(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-lg">
            {wechatQR ? "微信扫码支付" : "选择支付方式"}
          </DialogTitle>
          <DialogDescription>
            购买「{pack.name}」 — {pack.credits.toLocaleString()} AI 点数
          </DialogDescription>
        </DialogHeader>

        {wechatQR ? (
          /* 微信二维码支付视图 */
          <div className="flex flex-col items-center gap-4 mt-2">
            {paid ? (
              <div className="w-52 h-52 bg-emerald-50 border-2 border-emerald-200 rounded-2xl flex flex-col items-center justify-center p-3 gap-3">
                <CheckCircle2 className="w-20 h-20 text-emerald-500" />
                <p className="text-lg font-bold text-emerald-700">支付成功</p>
                <p className="text-xs text-emerald-600">点数已到账</p>
              </div>
            ) : (
              <div className="w-52 h-52 bg-white border-2 border-emerald-200 rounded-2xl flex items-center justify-center p-3 shadow-inner relative">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(wechatQR.code_url)}`}
                  alt="微信支付二维码"
                  className="w-full h-full"
                />
                <div className="absolute bottom-2 right-2 bg-white/90 rounded-full px-2 py-1 flex items-center gap-1 shadow-sm">
                  <Loader2 className="w-3 h-3 animate-spin text-emerald-500" />
                  <span className="text-[10px] text-slate-500">等待支付</span>
                </div>
              </div>
            )}
            <div className="text-center space-y-1">
              <p className="text-sm text-slate-700 font-medium">
                {paid ? "即将关闭..." : "请使用微信扫码支付"}
              </p>
              <p className="text-xs text-slate-400">订单号: {wechatQR.order_no}</p>
              <p className="text-lg font-bold text-emerald-600">{pack.priceDisplay}</p>
            </div>
            {!paid && (
              <>
                <p className="text-[11px] text-slate-400 text-center">支付完成后点数将自动到账，请勿关闭此窗口</p>
                <Button variant="outline" size="sm" onClick={handleBackToMethods} className="mt-1">
                  <ArrowLeft className="w-4 h-4 mr-1" />
                  返回选择支付方式
                </Button>
              </>
            )}
          </div>
        ) : (
          /* 支付方式选择视图 */
          <>
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
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">扫码支付（Native Pay）</p>
                  </div>
                  <div className="flex-shrink-0">
                    {loading === "wechat" ? (
                      <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                    ) : (
                      <QrCode className="w-4 h-4 text-slate-400" />
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}