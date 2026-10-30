// Agent 抽屉（右侧 Sheet）：Agent 形象 + 专业方案（Agent 市场入口）+ 能力清单 + 主动推动说明 + 暂停/恢复开关
import React from "react";
import { Bot, ChevronRight, FileText, ListChecks, MessageCircleMore, Pause, Play, Sparkles, Store, Wifi } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetTitle,
} from "@/components/ui/sheet";
import { C } from "./constants";
import { AgentAvatar } from "./Common";

const CAPABILITIES = [
  { icon: Sparkles, label: "整理共识与分歧", description: "把讨论落成共识纪要与分歧清单" },
  { icon: FileText, label: "生成纪要", description: "沉淀带来源可追溯的文件" },
  { icon: ListChecks, label: "提取子约定", description: "生成可确认的草案，待人拍板" },
  { icon: MessageCircleMore, label: "协调分歧", description: "用中性问题推进停滞的沟通" },
  { icon: Wifi, label: "联网检索补充攻略与建议", description: "结合外部信息给出可执行参考" },
  { icon: Bot, label: "停滞时主动推动", description: "空间停滞超 24h 或节点临期时主动出面" },
];

export default function AgentDrawer({ open, onOpenChange, agentEnabled, agentPaused, agentMeta, toggling, onToggleAgent, onOpenStore }) {
  const templateName = agentMeta?.templateName;
  const templateDomain = agentMeta?.templateDomain;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[360px] p-0 gap-0 overflow-hidden"
        style={{ backgroundColor: "#f7f7f2", borderLeft: `1px solid ${C.line}` }}
      >
        <SheetTitle className="sr-only">心栈 Agent 协同面板</SheetTitle>

        {/* 头部：Agent 形象 */}
        <div className="flex h-20 shrink-0 items-center justify-between border-b px-5" style={{ borderColor: "#deddd7" }}>
          <div className="flex items-center gap-3">
            <AgentAvatar size="lg" />
            <div>
              <div className="text-sm font-semibold" style={{ color: "#312e2c" }}>
                {templateName ? `心栈 Agent · ${templateName}` : "心栈 Agent · 整理 + 沟通"}
              </div>
              <div className="mt-1 flex items-center gap-1.5 text-[10px]" style={{ color: "#6f6b64" }}>
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: agentEnabled && !agentPaused ? C.green : "#b8b4ab" }} />
                {agentEnabled && !agentPaused
                  ? (templateName ? `${templateDomain}领域专业身份 · 运行中` : "共同记忆与共识助手 · 运行中")
                  : "已暂停，仅保留历史记录"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {/* Agent 市场：当前方案 + 入口 */}
          <div
            className="flex items-start gap-3 rounded-md border p-3.5"
            style={{ borderColor: templateName ? "#384877" : "#dcdad3", backgroundColor: templateName ? "#eef0f8" : "#faf9f5" }}
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ backgroundColor: templateName ? "#384877" : "#e4e6f8", color: templateName ? "#faf9f5" : "#384877" }}
            >
              <Store className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold" style={{ color: "#3b3734" }}>Agent 市场</span>
                {templateName && (
                  <span className="rounded-full px-1.5 py-0.5 text-[9px] font-medium" style={{ backgroundColor: "#384877", color: "#faf9f5" }}>
                    {templateName}
                  </span>
                )}
              </div>
              <p className="mt-1 text-[10px] leading-4" style={{ color: "#77736c" }}>
                {templateName
                  ? `正在以${templateDomain}领域专业身份协同；可随时更换或恢复默认。`
                  : "法律、旅行、教育、财务等 16 位专业 Agent 可按需启用，让建议更专业。"}
              </p>
              <button
                type="button"
                onClick={onOpenStore}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-[#384877] hover:underline underline-offset-2 min-h-7"
              >
                {templateName ? "更换方案" : "去挑选"}<ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>

          {/* 边界说明 */}
          <div className="rounded-md border p-4" style={{ borderColor: "#dcdfe8", backgroundColor: "#eef0f8" }}>
            <div className="flex items-center gap-2 text-xs font-semibold" style={{ color: "#302b79" }}>边界清晰，来源可追溯</div>
            <p className="mt-2 text-xs leading-5" style={{ color: "#575368" }}>
              只读取当前约定空间。所有子约定与文件先保存为草案，不会替任何成员作出承诺。
            </p>
          </div>

          {/* 能力清单 */}
          <div className="mt-6">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: C.sub }}>我可以帮你</div>
            <div className="mt-3 space-y-2">
              {CAPABILITIES.map(({ icon: Icon, label, description }) => (
                <div
                  key={label}
                  className="flex items-start gap-3 rounded-md border p-3"
                  style={{ borderColor: "#dcdad3", backgroundColor: "#faf9f5" }}
                >
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: "#e4e6f8", color: "#384877" }}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold" style={{ color: "#3b3734" }}>{label}</div>
                    <div className="mt-0.5 text-[10px] leading-4" style={{ color: "#77736c" }}>{description}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 主动推动说明 + 暂停/恢复 */}
          <div className="mt-6 border-t pt-5" style={{ borderColor: "#deddd7" }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: C.sub }}>主动推动</div>
            <p className="mt-2 text-xs leading-5" style={{ color: "#77736c" }}>
              开启时：空间停滞超 24 小时或节点临期，Agent 会主动在讨论中出面推进；暂停后只在被 @ 召唤时响应。
            </p>
            {agentEnabled ? (
              <div className="mt-3 flex items-center justify-between rounded-md border px-3 py-2.5" style={{ borderColor: "#dcdad3", backgroundColor: "#faf9f5" }}>
                <span className="flex items-center gap-2 text-xs font-medium" style={{ color: "#45413d" }}>
                  {agentPaused ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" style={{ color: C.green }} />}
                  {agentPaused ? "心栈 Agent 已暂停" : "心栈 Agent 运行中"}
                </span>
                <Switch
                  checked={!agentPaused}
                  onCheckedChange={onToggleAgent}
                  disabled={toggling}
                  className="data-[state=checked]:bg-[#384877]"
                />
              </div>
            ) : (
              <p className="mt-3 text-xs" style={{ color: "#99958d" }}>当前空间未启用 Agent，可在创建协同时开启。</p>
            )}
          </div>

          <div className="mt-6 border-t pt-5" style={{ borderColor: "#deddd7" }}>
            <div className="font-mono text-[10px] uppercase tracking-[0.16em]" style={{ color: C.sub }}>如何召唤</div>
            <p className="mt-2 text-xs leading-5" style={{ color: "#77736c" }}>
              在讨论输入框输入 <span className="font-medium" style={{ color: "#45413d" }}>@</span> 会自动弹出心栈 Agent：直接说要总结讨论、查外部攻略，或把内容转成子约定、节点、沉淀，它会结合全部讨论上下文回应；消息上也可以插入图片与文档附件一起沉淀。
            </p>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-[#384877] hover:underline underline-offset-2 min-h-8"
            >
              回到讨论<ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
