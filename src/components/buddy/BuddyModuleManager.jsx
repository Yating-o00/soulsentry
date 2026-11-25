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

const FEATURE_EXAMPLES = [
  "增加一个个性化健身指导入口，结合我上传的训练方案，按目标和器械条件排计划",
  "增加一个菜单入口，按菜系给菜谱参考，我问做法时能给具体步骤",
  "增加一个项目方案入口，帮我拆目标、排节奏、做复盘",
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
          {module.hint || (moduleTypeLabel(module.type) !== module.label ? moduleTypeLabel(module.type) : "")}
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
  const [customHint, setCustomHint] = useState("");
  const [customInstructions, setCustomInstructions] = useState("");
  const [customPlaceholder, setCustomPlaceholder] = useState("");
  const [customIcon, setCustomIcon] = useState("");
  const [customExamples, setCustomExamples] = useState([]);
  const [customWebResearch, setCustomWebResearch] = useState(true);
  const [featureBrief, setFeatureBrief] = useState("");
  const [parsingFeature, setParsingFeature] = useState(false);
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
    setCustomHint("");
    setCustomInstructions("");
    setCustomPlaceholder("");
    setCustomIcon("");
    setCustomExamples([]);
    setCustomWebResearch(true);
    setFeatureBrief("");
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

  const parseFeature = async () => {
    const text = featureBrief.trim();
    if (!text || parsingFeature) return;
    setParsingFeature(true);
    try {
      const result = await httpRequest(`/api/buddies/${buddy.id}/features/parse`, {
        method: "POST",
        body: { text },
      });
      const feature = result?.feature;
      if (!feature) throw new Error("empty feature");
      setCustomType("assistant");
      setCustomLabel(String(feature.label || "").slice(0, 12));
      setCustomHint(String(feature.hint || "").slice(0, 80));
      setCustomInstructions(String(feature.instructions || "").slice(0, 800));
      setCustomPlaceholder(String(feature.placeholder || "").slice(0, 60));
      setCustomIcon(String(feature.icon || "").slice(0, 24));
      setCustomExamples(Array.isArray(feature.examples) ? feature.examples.slice(0, 4) : []);
      setCustomOpen(true);
      setFeatureBrief("");
      toast.success(result.degraded ? "已生成功能草稿，可以再改改" : "功能已生成，确认后添加");
    } catch (error) {
      toast.error(error?.data?.message || error?.message || "这句话还没法变成功能，换个说法试试");
    } finally {
      setParsingFeature(false);
    }
  };

  const addCustom = () => {
    if (customType === "assistant" && !customInstructions.trim()) {
      toast.error("先说说这个功能怎么帮你");
      return;
    }
    const created = createCustomModule({
      label: customLabel,
      type: customType,
      unit: customUnit,
      hint: customHint,
      instructions: customInstructions,
      placeholder: customPlaceholder,
      icon: customIcon,
      examples: customExamples,
      webResearch: customWebResearch,
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
    setCustomHint("");
    setCustomInstructions("");
    setCustomPlaceholder("");
    setCustomIcon("");
    setCustomExamples([]);
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
                <div className="mt-2 rounded-lg border border-stone-200 bg-white p-2.5">
                  <div className="text-[10px] font-medium text-stone-600">用一句话描述，让搭子生成功能</div>
                  <textarea
                    value={featureBrief}
                    onChange={(event) => setFeatureBrief(event.target.value.slice(0, 600))}
                    rows={2}
                    placeholder="例如：增加一个菜单入口，能按菜系给菜谱参考，也能教我做菜"
                    className="mt-1.5 w-full resize-none rounded-lg border border-stone-200 bg-[#FAF9F7] px-2.5 py-2 text-[11px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
                  />
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {FEATURE_EXAMPLES.slice(0, 2).map((example) => (
                      <button
                        key={example}
                        type="button"
                        onClick={() => setFeatureBrief(example)}
                        className="max-w-full truncate rounded-full border border-stone-200 px-2 py-0.5 text-[8px] text-stone-400 hover:text-stone-600"
                      >
                        {example}
                      </button>
                    ))}
                    <Button
                      type="button"
                      onClick={parseFeature}
                      disabled={!featureBrief.trim() || parsingFeature}
                      className="ml-auto min-h-[28px] px-2.5 text-[10px] text-white"
                      style={{ backgroundColor: "#384877" }}
                    >
                      {parsingFeature ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />}
                      生成
                    </Button>
                  </div>
                </div>
              )}
              <input
                value={customLabel}
                onChange={(event) => setCustomLabel(event.target.value.slice(0, 12))}
                placeholder={customType === "assistant" ? "功能名称，如「个性化指导」" : "模块名称，如「康复记录」"}
                className="mt-2 w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-[12px] text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
              />
              {customType === "assistant" && (
                <>
                  <textarea
                    value={customInstructions}
                    onChange={(event) => setCustomInstructions(event.target.value.slice(0, 800))}
                    rows={3}
                    placeholder="这个功能怎么帮你？例如：结合我上传的健身方案和身体数据，排每周训练，并给动作要点。"
                    className="mt-2 w-full resize-none rounded-lg border border-stone-200 bg-white px-3 py-2 text-[11px] leading-relaxed text-stone-700 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none"
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
