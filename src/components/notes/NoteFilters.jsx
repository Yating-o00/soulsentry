import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Filter, X, Calendar as CalendarIcon, Tag, LayoutGrid } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { TYPE_META, TYPE_ORDER } from "@/components/heartsign/heartSignMeta";

export default function NoteFilters({ filters, onFiltersChange, allTags = [], onCategorySelect, activeCategory = "all" }) {
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [open, setOpen] = useState(false);

  const toggleTag = (tag) => {
    const newTags = filters.tags?.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...(filters.tags || []), tag];
    onFiltersChange({ ...filters, tags: newTags });
  };

  const handleDateRangeChange = (range) => {
    setDateRange(range);
    onFiltersChange({ ...filters, dateRange: range });
  };

  const clearFilters = () => {
    setDateRange({ from: null, to: null });
    onFiltersChange({});
  };

  const activeFilterCount =
    (filters.tags?.length || 0) +
    (filters.dateRange?.from ? 1 : 0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Advanced Filters Popover */}
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 gap-1.5 relative">
            <Filter className="w-3.5 h-3.5" />
            高级筛选
            {activeFilterCount > 0 && (
              <Badge className="absolute -top-1.5 -right-1.5 h-4 w-4 p-0 flex items-center justify-center text-[9px] bg-[#384877] border-0">
                {activeFilterCount}
              </Badge>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-4" align="start">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-sm">筛选条件</h4>
              {activeFilterCount > 0 && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="h-6 text-xs">
                  清除全部
                </Button>
              )}
            </div>

            {/* 按分类筛选：类别与签色一一对应，点击跳转 */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <LayoutGrid className="w-3.5 h-3.5" />
                按分类筛选
              </Label>
              <div className="grid grid-cols-3 gap-2">
                {TYPE_ORDER.map((key) => {
                  const meta = TYPE_META[key];
                  const active = activeCategory === key;
                  return (
                    <button
                      key={key}
                      onClick={() => {
                        onCategorySelect?.(key);
                        setOpen(false);
                      }}
                      className={`h-10 rounded-lg text-xs font-medium border transition-all ${
                        active ? 'ring-2 ring-[#384877] ring-offset-2 scale-105' : 'hover:scale-105 border-transparent'
                      }`}
                      style={{ background: meta.bg, color: meta.color }}
                      title={`只看${meta.label}签`}
                    >
                      {meta.label}签
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Tag Filter */}
            {allTags.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Tag className="w-3.5 h-3.5" />
                  按标签筛选
                </Label>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                  {allTags.map(tag => (
                    <Badge
                      key={tag}
                      variant={filters.tags?.includes(tag) ? "default" : "outline"}
                      className={`cursor-pointer text-xs ${
                        filters.tags?.includes(tag)
                          ? 'bg-[#384877] hover:bg-[#2c3b63]'
                          : 'hover:bg-slate-100'
                      }`}
                      onClick={() => toggleTag(tag)}
                    >
                      #{tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Date Range Filter */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <CalendarIcon className="w-3.5 h-3.5" />
                按日期筛选
              </Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="w-full justify-start text-xs">
                    <CalendarIcon className="w-3.5 h-3.5 mr-2" />
                    {dateRange?.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "PPP", { locale: zhCN })} - {format(dateRange.to, "PPP", { locale: zhCN })}
                        </>
                      ) : (
                        format(dateRange.from, "PPP", { locale: zhCN })
                      )
                    ) : (
                      "选择日期范围"
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={handleDateRangeChange}
                    numberOfMonths={2}
                    locale={zhCN}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
        </PopoverContent>
      </Popover>

      {/* Active Filter Tags */}
      <AnimatePresence mode="popLayout">
        {filters.tags?.map(tag => (
          <motion.div
            key={`tag-${tag}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Badge variant="secondary" className="gap-1.5">
              #{tag}
              <X className="w-3 h-3 cursor-pointer" onClick={() => toggleTag(tag)} />
            </Badge>
          </motion.div>
        ))}
        {filters.dateRange?.from && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Badge variant="secondary" className="gap-1.5">
              <CalendarIcon className="w-3 h-3" />
              {format(filters.dateRange.from, "MM/dd", { locale: zhCN })}
              {filters.dateRange.to && ` - ${format(filters.dateRange.to, "MM/dd", { locale: zhCN })}`}
              <X
                className="w-3 h-3 cursor-pointer"
                onClick={() => handleDateRangeChange({ from: null, to: null })}
              />
            </Badge>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}