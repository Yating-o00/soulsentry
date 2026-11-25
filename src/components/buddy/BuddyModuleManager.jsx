import React, { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, LayoutGrid, Loader2, Plus, RotateCcw, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { httpRequest } from "@/api/httpClient";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import BuddyModuleIcon from "@/components/buddy/BuddyModuleIcon";
import {
  MAX_BUDDY_MODULES, archivedModulesFromProfile, createCustomModule, getDefaultModules,
  moduleCatalogFor, moduleTypeLabel, resolveBuddyModules, serializeArchivedModules,
  serializeBuddyModules,
} from "@/lib/buddyModules";

const CUSTOM_TYPES = [
  { value: "checklist", label: "清单", hint: "逐项勾选" },
  { value: "notes", label: "笔记", hint: "自由记录" },
  { value: "tracker", label: "追踪", hint: "记录数值" },
];

const FEATURE_MODES = [
  { value: "guide", label: "内容指导" },
  { value: "language", label: "双语口语" },
];

function ModuleRow({ module, index, modules, tint, onMove, onRemove }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-2">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
        style={{ backgroundColor: `${tint?.[2] || "#384877"}12`, color: tint?.[2] || "#384877" }}
      >
        <BuddyModuleIcon module={module} className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-medium text-stone-800">{module.label}</span>
          {module.locked && (
            <span className="shrink-0 rounded-full bg-stone-100 px-1.5 py-0.5 text-[8px] text-stone-400">固定</span>
          )}
        </div>
        <p className="mt-0.5 truncate text-[9px] text-stone-400">
          {module.type === "assistant" && module.mode === "language"
            ? "双语口语"
            : module.hint || (moduleTypeLabel(module.type) !== module.label ? moduleTypeLabel(module.type) : "")}
        </p>
      </div>
      {!module.locked && (
        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => onMove(index, -1)}
            disabled={index <= 2}
            aria-label={`上移 ${module.label}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-25"
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onMove(index, 1)}
            disabled={index >= modules.length - 1}
            aria-label={`下移 ${module.label}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-700 disabled:opacity-25"
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => onRemove(module.id)}
            aria-label={`收起 ${module.label}`}
            className="flex h-7 w-7 items-center justify-center rounded-full text-stone-300 hover:bg-rose-50 hover:text-rose-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}

function CatalogCard({ item, onAdd, tint }) {
  return (
    <button
      type="button"
      onClick={() => onAdd(item)}
      className="flex min-h-[54px] items-start gap-2 rounded-xl border border-stone-200 bg-[#FAF9F7] px-2.5 py-2 text-left transition-colors hover:border-stone-300 hover:bg-white"
    >
      <span
        className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white"
        style={{ color: tint?.[2] || "#384877" }}
      >
        <BuddyModuleIcon module={item} className="h-3.5 w-3.5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 text-[11px] font-medium text-stone-700">
          {item.label}
          <Plus className="h-3 w-3 text-stone-400" />
        </span>
        <span className="mt-0.5 line-clamp-2 block text-[9px] leading-relaxed text-stone-400">
          {item.hint || (moduleTypeLabel(item.type) !== item.label ? moduleTypeLabel(item.type) : "按需添加")}
        </span>
      </span>
    </button>
  );
}

/**
 * 每颗搭子的页面模块管理器：
 * 首页和协同固定；用户可以收起或重新加入其他板块，调整顺序，
 * 也可以按自己的场景添加清单、笔记、数值追踪；
 * 自定义搭子还可以增加由 AI 执行的功能入口。
 */
export default function BuddyModuleManager({ open, onOpenChange, buddy, profile, tint, onSaved }) {
  const queryClient = useQueryClient();
  const [modules, setModules] = useState([]);
  const [archived, setArchived] = useState([]);
  const [customOpen, setCustomOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState("");
  const [customType, setCustomType] = useState("checklist");
  const [customUnit, setCustomUnit] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [customPlaceholder, setCustomPlaceholder] = useState("");
  const [customFeatureMode, setCustomFeatureMode] = useState("guide");
  const [customWebResearch, setCustomWebResearch] = useState(true);
  const [saving, setSaving] = useState(false);

  // 只在打开时读取一次布局：自定义搭子的 buddy 对象每次父级渲染都会重建，
  // 不能把它放进依赖里，否则用户正在输入的自定义模块会被重置。
  useEffect(() => {
    if (!open) return;
    setModules(resolveBuddyModules(buddy, profile));
    setArchived(archivedModulesFromProfile(profile));
    setCustomOpen(false);
    setCustomLabel("");
    setCustomType("checklist");
    setCustomUnit("");
    setCustomInstructions("");
    setCustomPlaceholder("");
    setCustomFeatureMode("guide");
    setCustomWebResearch(true);
  }, [open, buddy?.id]);

  const catalog = useMemo(() => moduleCatalogFor(buddy), [buddy]);
  const customTypes = buddy?.custom
    ? [...CUSTOM_TYPES, { value: "assistant", label: "智能功能", hint: "AI 回答" }]
    : CUSTOM_TYPES;
  const availableBuiltins = catalog.filter((item) => item.builtin && !modules.some((module) => module.id === item.id));
  const availableProfessional = catalog.filter((item) => !item.builtin && !modules.some((module) => module.id === item.id));
  const availableArchived = archived.filter((item) => !modules.some((module) => module.id === item.id));

  const addModule = (item) => {
    if (!item || modules.some((module) => module.id === item.id)) return;
    if (modules.length >= MAX_BUDDY_MODULES) {
      toast.info(`最多保留 ${MAX_BUDDY_MODULES} 个模块，先收起一个再加`);
      return;
    }
    if (modules.some((module) => module.label === item.label)) {
      toast.info("已经有同名模块，换个名字再添加");
      return;
    }
    setArchived((current) => current.filter((module) => module.id !== item.id));
    setModules((current) => [
      ...current,
      { ...item, items: Array.isArray(item.items) ? [...item.items] : item.items },
    ]);
  };

  const moveModule = (index, delta) => {
    const target = index + delta;
    if (index < 2 || target < 2 || target >= modules.length) return;
    setModules((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const removeModule = (id) => {
    const target = modules.find((module) => module.id === id);
    // 自定义模块收起后保留定义；重新加回时仍能读到原来的记录。
    if (target && !target.locked && !target.builtin && !catalog.some((item) => item.id === id)) {
      setArchived((current) => (
        current.some((module) => module.id === id) ? current : [...current, target].slice(0, 12)
      ));
    }
    setModules((current) => current.filter((module) => module.id !== id || module.locked));
  };

  const addCustom = () => {
    const description = customInstructions.trim();
    if (customType === "assistant" && !description) {
      toast.error("先写一句这个功能怎么帮你");
      return;
    }
    const icon = customType === "assistant"
      ? (customFeatureMode === "language" ? "messages-square"
        : /(菜单|菜谱|厨房|做饭|烹饪|饮食)/.test(`${customLabel} ${description}`) ? "chef-hat"
          : /(健身|训练|运动|增肌|减脂|力量|康复)/.test(`${customLabel} ${description}`) ? "dumbbell"
            : /(预算|记账|理财|花费)/.test(`${customLabel} ${description}`) ? "wallet"
              : /(计划|方案|复盘)/.test(`${customLabel} ${description}`) ? "briefcase"
                : "sparkles")
      : "";
    const created = createCustomModule({
      label: customLabel,
      type: customType,
      unit: customUnit,
      hint: customType === "assistant" ? description.slice(0, 80) : "",
      instructions: description,
      placeholder: customPlaceholder,
      icon,
      webResearch: customWebResearch,
      featureMode: customFeatureMode,
    });
    if (!created) {
      toast.error("先给这个模块起个名字");
      return;
    }
    if (modules.some((module) => module.label === created.label)) {
      toast.info("已经有同名模块，换个名字再添加");
      return;
    }
    if (modules.length >= MAX_BUDDY_MODULES) {
      toast.info(`最多保留 ${MAX_BUDDY_MODULES} 个模块，先收起一个再加`);
      return;
    }
    setModules((current) => [...current, created]);
    setCustomLabel("");
    setCustomUnit("");
    setCustomInstructions("");
    setCustomPlaceholder("");
    setCustomFeatureMode("guide");
    setCustomWebResearch(true);
    setCustomOpen(false);
    toast.success(created.type === "assistant" ? "功能已添加，保存后可以在功能页上传参考资料" : "模块已添加，记得保存");
  };

  const resetModules = () => {
    const defaults = getDefaultModules(buddy);
    const custom = modules.filter((module) => !module.builtin);
    const core = defaults.slice(0, 2);
    const optional = defaults.slice(2);
    const next = [];
    for (const item of [...core, ...custom, ...optional]) {
      if (next.some((module) => module.id === item.id)) continue;
      next.push(item);
      if (next.length >= MAX_BUDDY_MODULES) break;
    }
    setModules(next);
    toast.info("已恢复默认板块，已记录的数据不会删除");
  };

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await httpRequest(`/api/buddies/${buddy.id}/layout`, {
        method: "POST",
        body: {
          modules: serializeBuddyModules(modules),
          archived: serializeArchivedModules(archived),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["buddies"] });
      toast.success("页面模块已更新");
      onSaved?.();
      onOpenChange(false);
    } catch (error) {
      toast.error(error?.data?.message || error?.message || "保存失败，请稍后再试");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-[520px] overflow-y-auto rounded-2xl p-4 sm:p-5">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-[16px] text-stone-900">
            <LayoutGrid className="h-4 w-4 text-[#384877]" /> 调整页面模块
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-stone-600">当前页面</span>
            <span className="text-[10px] text-stone-400">{modules.length}/{MAX_BUDDY_MODULES}</span>
          </div>

          <div className="space-y-1.5">
            {modules.map((module, index) => (
              <ModuleRow
                key={module.id}
                module={module}
                index={index}
                modules={modules}
                tint={tint}
                onMove={moveModule}
                onRemove={removeModule}
              />
            ))}
          </div>

          {availableBuiltins.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-stone-600">页面板块</div>
              <div className="grid grid-cols-2 gap-1.5">
                {availableBuiltins.map((item) => (
                  <CatalogCard key={item.id} item={item} tint={tint} onAdd={addModule} />
                ))}
              </div>
            </div>
          )}

          {availableProfessional.length > 0 && (
            <div>
              <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium text-stone-600">
                <Sparkles className="h-3.5 w-3.5 text-[#B89A6A]" /> 专业模块
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                {availableProfessional.map((item) => (
                  <CatalogCard key={item.id} item={item} tint={tint} onAdd={addModule} />
                ))}
              </div>
            </div>
          )}

          {availableArchived.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-medium text-stone-600">已收起</div>
              <div className="grid grid-cols-2 gap-1.5">
                {availableArchived.map((item) => (
                  <CatalogCard key={item.id} item={item} tint={tint} onAdd={addModule} />
                ))}
              </div>
            </div>
          )}

          {!customOpen ? (
            <div className={cn("grid gap-1.5", buddy?.custom ? "grid-cols-2" : "grid-cols-1")}>
              <button
                type="button"
                onClick={() => {
                  setCustomType("checklist");
                  setCustomOpen(true);
                }}
                className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-stone-300 text-[11px] text-stone-500 hover:border-stone-400 hover:text-stone-700"
              >
                <Plus className="h-3.5 w-3.5" /> 新建自定义模块
              </button>
              {buddy?.custom && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomType("assistant");
                    setCustomOpen(true);
                  }}
                  className="flex min-h-[40px] w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#B89A6A]/60 bg-[#B89A6A]/5 text-[11px] text-[#8a6f48] hover:border-[#B89A6A]"
                >
                  <Sparkles className="h-3.5 w-3.5" /> 给搭子加功能
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-stone-200 bg-[#FAF9F7] p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-stone-700">
                  {customType === "assistant" ? "给搭子加一个智能功能" : "新建自定义模块"}
                </span>
                <button
                  type="button"
                  onClick={() => setCustomOpen(false)}
                  className="flex h-6 w-6 items-center justify-center rounded-full text-stone-400 hover:bg-white"
                  aria-label="关闭自定义模块表单"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="mt-2 flex gap-1.5">
                {customTypes.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => setCustomType(item.value)}
                    className={cn(
                      "flex-1 rounded-lg border px-1.5 py-1.5 text-[10px] transition-colors",
                      customType === item.value
                        ? "border-[#384877] bg-white font-medium text-[#384877]"
                        : "border-stone-200 bg-white text-stone-500"
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {customType === "assistant" && (
                <p className="mt-2 text-[9px] leading-relaxed text-stone-400">
                  填写功能名称和描述，添加后即可在搭子里使用。
                </p>
              )}
              {customType === "assistant" && (
                <>
                  <div className="mt-2 text-[10px] text-stone-500">功能类型</div>
                  <div className="mt-1 flex gap-1.5">
                    {FEATURE_MODES.map((item) => (
                      <button
                        key={item.value}
                        type="button"
                        onClick={() => setCustomFeatureMode(item.value)}
                        className={cn(
                          "flex-1 rounded-lg border px-2 py-1.5 text-[10px] transition-colors",
                          customFeatureMode === item.value
                            ? "border-[#384877] bg-white font-medium text-[#384877]"
                            : "border-stone-200 bg-white text-stone-500"
                        )}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  {customFeatureMode === "language" && (
                    <p className="mt-1.5 text-[9px] leading-relaxed text-stone-400">
                      会提供英文对话、中文翻译、表达纠错和语音朗读。
                    </p>
                  )}
                </>
              )}
              {customType === "assistant" && (
                <div className="mt-2 text-[10px] text-stone-500">功能名称</div>
              )}
              <input
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value.slice(0, 12))}
                placeholder={customType === "assistant" ? (customFeatureMode === "language" ? "如「英语口语陪练」" : "如「个性化指导」「菜单」") : "模块名称，如「康复记录」"}
                className={cn(
                  "w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[12px] text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none",
                  customType === "assistant" ? "mt-1" : "mt-2"
                )}
              />
              {customType === "assistant" && (
                <>
                  <div className="mt-2 text-[10px] text-stone-500">功能描述</div>
                  <textarea
                    value={customInstructions}
                    onChange={(event) => setCustomInstructions(event.target.value.slice(0, 800))}
                    rows={3}
                    placeholder={customFeatureMode === "language" ? "描述陪练方式，例如：围绕日常场景用英语对话，给中文翻译、纠错和更自然的说法。" : "描述这个功能怎么帮你，例如：结合我上传的健身方案和身体数据，排每周训练，并给动作要点。"}
                    className="mt-1 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                  />
                  <input
                    value={customPlaceholder}
                    onChange={(event) => setCustomPlaceholder(event.target.value.slice(0, 60))}
                    placeholder="输入框提示，如「说说目标和每周能训练的时间」"
                    className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                  />
                  <div className="mt-2 flex items-center justify-between gap-3 rounded-lg border border-stone-200 bg-white px-3 py-2">
                    <div className="min-w-0">
                      <div className="text-[11px] text-stone-700">联网参考</div>
                      <div className="mt-0.5 text-[9px] leading-relaxed text-stone-400">
                        检索公开网页并附来源；有上传资料时以资料优先
                      </div>
                    </div>
                    <Switch
                      checked={customWebResearch}
                      onCheckedChange={setCustomWebResearch}
                      className="shrink-0 data-[state=checked]:bg-[#384877]"
                    />
                  </div>
                  <p className="mt-1.5 text-[9px] leading-relaxed text-stone-400">
                    保存后进入功能页，可以上传健身方案、菜单等参考资料。
                  </p>
                </>
              )}
              {customType === "tracker" && (
                <input
                  value={customUnit}
                  onChange={(event) => setCustomUnit(event.target.value.slice(0, 6))}
                  placeholder="单位（可选），如 次 / 元 / km"
                  className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[12px] text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                />
              )}
              <div className="mt-2 flex justify-end">
                <Button
                  type="button"
                  onClick={addCustom}
                  disabled={!customLabel.trim() || (customType === "assistant" && !customInstructions.trim())}
                  className="min-h-[34px] text-[11px] text-white"
                  style={{ backgroundColor: "#384877" }}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> 添加
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-1 flex-row items-center justify-between gap-2 sm:justify-between">
          <button
            type="button"
            onClick={resetModules}
            className="inline-flex items-center gap-1 text-[10px] text-stone-400 hover:text-stone-600"
          >
            <RotateCcw className="h-3 w-3" /> 恢复默认
          </button>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" className="min-h-[36px] text-xs" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={saving}
              className="min-h-[36px] text-xs text-white"
              style={{ backgroundColor: "#384877" }}
            >
              {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
              保存
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
