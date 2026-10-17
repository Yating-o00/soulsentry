import React, { useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
  DrawerClose,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * MobileSelect — 底部抽屉式选择器，专为移动端优化大拇指点击。
 *
 * 用法：
 *   <MobileSelect
 *     value={category}
 *     onChange={setCategory}
 *     options={[{ value: 'work', label: '工作' }, ...]}
 *     placeholder="选择分类"
 *   />
 *
 * 桌面端可直接使用，行为与原生 select 类似但视觉更友好。
 */
export default function MobileSelect({
  value,
  onChange,
  options = [],
  placeholder = "请选择",
  title = "请选择",
  className,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild disabled={disabled}>
        <button
          type="button"
          className={cn(
            "flex items-center justify-between w-full h-11 px-3 rounded-lg border border-slate-200 bg-white text-left text-sm",
            "hover:border-slate-300 focus:outline-none focus:ring-2 focus:ring-[#384877]/30",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          disabled={disabled}
        >
          <span className={selected ? "text-slate-900" : "text-slate-400"}>
            {selected?.label || placeholder}
          </span>
          <ChevronDown className="w-4 h-4 text-slate-400 flex-shrink-0" />
        </button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[80vh]">
        <DrawerHeader className="text-left border-b border-slate-100">
          <DrawerTitle className="text-base">{title}</DrawerTitle>
        </DrawerHeader>
        <div className="px-2 py-2 overflow-y-auto">
          {options.map((opt) => {
            const isActive = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  onChange?.(opt.value);
                  setOpen(false);
                }}
                className={cn(
                  "w-full flex items-center justify-between px-4 py-3.5 rounded-lg text-left text-[15px]",
                  "transition-colors active:bg-slate-100",
                  isActive ? "bg-[#384877]/5 text-[#384877] font-medium" : "text-slate-700"
                )}
              >
                <span className="flex items-center gap-2">
                  {opt.icon}
                  {opt.label}
                </span>
                {isActive && <Check className="w-4 h-4 text-[#384877]" />}
              </button>
            );
          })}
        </div>
        <div className="p-3 border-t border-slate-100">
          <DrawerClose asChild>
            <Button variant="outline" className="w-full h-11">取消</Button>
          </DrawerClose>
        </div>
      </DrawerContent>
    </Drawer>
  );
}