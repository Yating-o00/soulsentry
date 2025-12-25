import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Label } from "@/components/ui/label";
import { Filter, X, Pin, Calendar as CalendarIcon, Tag, Palette } from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";

const COLORS = [
  { name: "white", label: "白色", class: "bg-white" },
  { name: "red", label: "红色", class: "bg-red-100" },
  { name: "orange", label: "橙色", class: "bg-orange-100" },
  { name: "yellow", label: "黄色", class: "bg-yellow-100" },
  { name: "green", label: "绿色", class: "bg-green-100" },
  { name: "blue", label: "蓝色", class: "bg-blue-100" },
  { name: "purple", label: "紫色", class: "bg-purple-100" },
  { name: "pink", label: "粉色", class: "bg-pink-100" },
];

export default function NoteFilters({ filters, onFiltersChange, allTags = [] }) {
  const [dateRange, setDateRange] = useState({ from: null, to: null });

  const toggleColor = (color) => {
    const newColors = filters.colors?.includes(color)
      ? filters.colors.filter(c => c !== color)
      : [...(filters.colors || []), color];
    onFiltersChange({ ...filters, colors: newColors });
  };

  const toggleTag = (tag) => {
    const newTags = filters.tags?.includes(tag)
      ? filters.tags.filter(t => t !== tag)
      : [...(filters.tags || []), tag];
    onFiltersChange({ ...filters, tags: newTags });
  };

  const togglePinned = () => {
    onFiltersChange({ 
      ...filters, 
      pinnedOnly: filters.pinnedOnly === true ? null : true 
    });
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
    (filters.colors?.length || 0) + 
    (filters.tags?.length || 0) + 
    (filters.pinnedOnly ? 1 : 0) + 
    (filters.dateRange?.from ? 1 : 0);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Quick Pinned Filter */}
      <Button
        variant={filters.pinnedOnly ? "default" : "outline"}
        size="sm"
        onClick={togglePinned}
        className={`h-8 gap-1.5 ${filters.pinnedOnly ? 'bg-gradient-to-r from-[#384877] to-[#3b5aa2] text-white' : ''}`}
      >
        <Pin className="w-3.5 h-3.5" />
        已置顶
      </Button>

      {/* Advanced Filters Popover */}
      <Popover>
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

            {/* Color Filter */}
            <div className="space-y-2">
              <Label className="text-xs flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5" />
                按颜色筛选
              </Label>
              <div className="grid grid-cols-4 gap-2">
                {COLORS.map(color => (
                  <button
                    key={color.name}
                    onClick={() => toggleColor(color.name)}
                    className={`h-10 rounded-lg border-2 transition-all ${color.class} ${
                      filters.colors?.includes(color.name)
                        ? 'ring-2 ring-[#384877] ring-offset-2 scale-105'
                        : 'hover:scale-105 border-slate-200'
                    }`}
                    title={color.label}
                  >
                    {filters.colors?.includes(color.name) && (
                      <div className="text-[#384877] font-bold">✓</div>
                    )}
                  </button>
                ))}
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
        {filters.colors?.map(color => (
          <motion.div
            key={`color-${color}`}
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
          >
            <Badge variant="secondary" className="gap-1.5">
              <div className={`w-3 h-3 rounded-full ${COLORS.find(c => c.name === color)?.class}`} />
              {COLORS.find(c => c.name === color)?.label}
              <X className="w-3 h-3 cursor-pointer" onClick={() => toggleColor(color)} />
            </Badge>
          </motion.div>
        ))}
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