import React from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Badge } from "@/components/ui/badge";
import { 
    Filter, 
    Calendar as CalendarIcon, 
    User, 
    Tag, 
    X,
    Check
} from "lucide-react";
import { format } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";

export default function AdvancedTaskFilters({ filters, onChange, onClear }) {
    const { data: users = [] } = useQuery({
        queryKey: ['users'],
        queryFn: () => base44.entities.User.list(),
        initialData: []
    });

    const activeFilterCount = [
        filters.dateRange?.from,
        filters.createdBy !== 'all',
        filters.tags?.length > 0
    ].filter(Boolean).length;

    const handleDateSelect = (range) => {
        onChange({ ...filters, dateRange: range });
    };

    const handleCreatorChange = (value) => {
        onChange({ ...filters, createdBy: value });
    };

    const handleTagAdd = (tag) => {
        if (!tag) return;
        const currentTags = filters.tags || [];
        if (!currentTags.includes(tag)) {
            onChange({ ...filters, tags: [...currentTags, tag] });
        }
    };

    const handleTagRemove = (tag) => {
        const currentTags = filters.tags || [];
        onChange({ ...filters, tags: currentTags.filter(t => t !== tag) });
    };

    return (
        <Popover>
            <PopoverTrigger asChild>
                <Button variant="outline" className={`h-10 border-slate-200 bg-white shadow-sm hover:bg-slate-50 ${activeFilterCount > 0 ? 'text-indigo-600 border-indigo-200 bg-indigo-50' : 'text-slate-600'}`}>
                    <Filter className="w-4 h-4 mr-2" />
                    筛选
                    {activeFilterCount > 0 && (
                        <Badge className="ml-2 h-5 w-5 p-0 flex items-center justify-center bg-indigo-600 text-white rounded-full text-[10px]">
                            {activeFilterCount}
                        </Badge>
                    )}
                </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-4" align="end">
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-medium text-slate-900">高级筛选</h4>
                        {activeFilterCount > 0 && (
                            <Button variant="ghost" size="sm" onClick={onClear} className="h-8 text-xs text-slate-500 hover:text-red-600">
                                清除全部
                            </Button>
                        )}
                    </div>

                    {/* Date Range Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                            <CalendarIcon className="w-3.5 h-3.5" />
                            截止日期范围
                        </label>
                        <div className="border rounded-md p-2">
                             <Calendar
                                mode="range"
                                selected={filters.dateRange}
                                onSelect={handleDateSelect}
                                locale={zhCN}
                                initialFocus
                                numberOfMonths={1}
                            />
                        </div>
                    </div>

                    {/* Creator Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                            <User className="w-3.5 h-3.5" />
                            创建人
                        </label>
                        <Select value={filters.createdBy} onValueChange={handleCreatorChange}>
                            <SelectTrigger className="h-9">
                                <SelectValue placeholder="选择创建人" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">全部</SelectItem>
                                {users.map(user => (
                                    <SelectItem key={user.id} value={user.email}>
                                        {user.full_name || user.email}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Tags Filter */}
                    <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-500 flex items-center gap-1">
                            <Tag className="w-3.5 h-3.5" />
                            标签 (输入回车添加)
                        </label>
                        <Input 
                            placeholder="输入标签..." 
                            className="h-9"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    handleTagAdd(e.currentTarget.value);
                                    e.currentTarget.value = '';
                                }
                            }}
                        />
                        {filters.tags?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                                {filters.tags.map(tag => (
                                    <Badge key={tag} variant="secondary" className="bg-slate-100 text-slate-600">
                                        {tag}
                                        <button onClick={() => handleTagRemove(tag)} className="ml-1 hover:text-red-500">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </Badge>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </PopoverContent>
        </Popover>
    );
}