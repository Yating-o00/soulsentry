import React from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Sparkles, Zap, Crown } from "lucide-react";

const PLANS = [
  {
    id: "free",
    name: "免费版",
    price: "¥0",
    period: "永久免费",
    icon: Sparkles,
    color: "from-slate-500 to-slate-600",
    features: [
      "50 个约定管理",
      "30 个心签记录",
      "基础提醒功能",
      "7 天数据历史",
      "单设备同步"
    ],
    cta: "当前计划",
    disabled: true
  },
  {
    id: "pro",
    name: "专业版",
    price: "¥19",
    period: "每月",
    icon: Zap,
    color: "from-[#384877] to-[#3b5aa2]",
    badge: "推荐",
    features: [
      "无限约定和心签",
      "AI 智能分析",
      "高级提醒策略",
      "无限数据历史",
      "多设备同步",
      "团队协作（5人）",
      "优先客服支持"
    ],
    cta: "立即升级",
    highlighted: true
  },
  {
    id: "team",
    name: "团队版",
    price: "¥99",
    period: "每月",
    icon: Crown,
    color: "from-purple-500 to-purple-600",
    features: [
      "专业版全部功能",
      "无限团队成员",
      "高级数据分析",
      "自定义工作流",
      "API 访问权限",
      "专属客户经理",
      "SLA 服务保障"
    ],
    cta: "联系销售"
  }
];

export default function Pricing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white p-6 md:p-12">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <Badge className="mb-4 bg-gradient-to-r from-amber-400 to-amber-500 text-white border-0 text-sm px-4 py-1.5">
            🚀 内测功能 · 即将推出
          </Badge>
          <h1 className="text-4xl md:text-5xl font-bold text-slate-900 mb-4">
            选择适合你的计划
          </h1>
          <p className="text-lg text-slate-600 max-w-2xl mx-auto">
            从个人到团队，灵活的定价方案助你高效管理
          </p>
        </motion.div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-3 gap-8 mb-12">
          {PLANS.map((plan, index) => {
            const Icon = plan.icon;
            return (
              <motion.div
                key={plan.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Card className={`relative overflow-hidden h-full ${
                  plan.highlighted 
                    ? 'ring-2 ring-[#384877] shadow-2xl scale-105' 
                    : 'shadow-lg hover:shadow-xl'
                } transition-all duration-300`}>
                  {plan.badge && (
                    <div className="absolute top-4 right-4">
                      <Badge className="bg-gradient-to-r from-amber-400 to-amber-500 text-white border-0">
                        {plan.badge}
                      </Badge>
                    </div>
                  )}

                  <div className="p-8">
                    {/* Icon */}
                    <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${plan.color} flex items-center justify-center mb-4 shadow-lg`}>
                      <Icon className="w-7 h-7 text-white" />
                    </div>

                    {/* Plan Name */}
                    <h3 className="text-2xl font-bold text-slate-900 mb-2">
                      {plan.name}
                    </h3>

                    {/* Price */}
                    <div className="mb-6">
                      <div className="flex items-baseline gap-2">
                        <span className="text-5xl font-bold text-slate-900">
                          {plan.price}
                        </span>
                        <span className="text-slate-500">
                          {plan.period}
                        </span>
                      </div>
                    </div>

                    {/* Features */}
                    <ul className="space-y-3 mb-8">
                      {plan.features.map((feature, idx) => (
                        <li key={idx} className="flex items-start gap-3">
                          <div className={`rounded-full p-0.5 bg-gradient-to-br ${plan.color} mt-0.5 flex-shrink-0`}>
                            <Check className="w-4 h-4 text-white" />
                          </div>
                          <span className="text-slate-700">{feature}</span>
                        </li>
                      ))}
                    </ul>

                    {/* CTA Button */}
                    <Button
                      className={`w-full h-12 text-base font-semibold ${
                        plan.highlighted
                          ? `bg-gradient-to-r ${plan.color} text-white hover:opacity-90`
                          : plan.disabled
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-white border-2 border-slate-200 text-slate-700 hover:border-slate-300'
                      }`}
                      disabled={plan.disabled}
                    >
                      {plan.cta}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* FAQ Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="max-w-3xl mx-auto"
        >
          <h2 className="text-2xl font-bold text-slate-900 mb-6 text-center">
            常见问题
          </h2>
          <div className="space-y-4">
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-2">
                可以随时取消订阅吗？
              </h3>
              <p className="text-slate-600">
                是的，您可以随时在账户设置中取消订阅，取消后将在当前计费周期结束时生效。
              </p>
            </Card>
            
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-2">
                支持哪些支付方式？
              </h3>
              <p className="text-slate-600">
                我们支持微信支付、支付宝和信用卡支付，所有支付均通过安全加密通道处理。
              </p>
            </Card>
            
            <Card className="p-6">
              <h3 className="font-semibold text-slate-900 mb-2">
                升级后数据会保留吗？
              </h3>
              <p className="text-slate-600">
                当然！升级后您的所有数据都会完整保留，并且立即解锁新功能。
              </p>
            </Card>
          </div>
        </motion.div>

        {/* Contact Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-center mt-12 p-8 bg-gradient-to-br from-slate-50 to-slate-100 rounded-2xl"
        >
          <h3 className="text-xl font-semibold text-slate-900 mb-2">
            需要定制方案？
          </h3>
          <p className="text-slate-600 mb-4">
            联系我们的销售团队，为您的企业量身定制专属解决方案
          </p>
          <Button className="bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white">
            联系销售团队
          </Button>
        </motion.div>
      </div>
    </div>
  );
}