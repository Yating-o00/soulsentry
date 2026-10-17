import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, Copy, StickyNote, MoreHorizontal, CheckCircle2, Search, Wand2, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { createPageUrl } from "@/utils";
import { Link } from "react-router-dom";

export default function TemplatesPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const queryClient = useQueryClient();

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ['task-templates'],
    queryFn: () => base44.entities.TaskTemplate.list(),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TaskTemplate.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(['task-templates']);
      setIsCreateOpen(false);
      toast.success("模板创建成功");
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TaskTemplate.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['task-templates']);
      setEditingTemplate(null);
      toast.success("模板更新成功");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TaskTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['task-templates']);
      toast.success("模板已删除");
    },
  });

  const filteredTemplates = templates.filter(t => 
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
    t.description?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">约定模板</h1>
          <p className="text-slate-500 mt-1">保存常用约定结构，快速创建重复任务</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600">
          <Plus className="w-4 h-4 mr-2" />
          新建模板
        </Button>
      </div>

      <div className="flex items-center gap-2 bg-white p-2 rounded-xl border border-slate-200 shadow-sm">
        <Search className="w-5 h-5 text-slate-400 ml-2" />
        <Input 
          placeholder="搜索模板..." 
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border-0 focus-visible:ring-0"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTemplates.map(template => (
          <Card key={template.id} className="hover:shadow-md transition-shadow group relative">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                        <StickyNote className="w-5 h-5" />
                    </div>
                    <div>
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                    </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity">
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditingTemplate(template)}>
                      <Edit className="w-4 h-4 mr-2" />
                      编辑
                    </DropdownMenuItem>
                    <DropdownMenuItem className="text-red-600" onClick={() => deleteMutation.mutate(template.id)}>
                      <Trash2 className="w-4 h-4 mr-2" />
                      删除
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
              <CardDescription className="line-clamp-2 mt-2 min-h-[40px]">
                {template.description || "暂无描述"}
              </CardDescription>
            </CardHeader>
            <CardContent>
               <div className="space-y-3">
                    <div className="flex flex-wrap gap-2">
                        {template.template_data?.priority && (
                             <Badge variant="outline" className="bg-slate-50">
                                优先级: {template.template_data.priority}
                             </Badge>
                        )}
                        {template.template_data?.category && (
                             <Badge variant="outline" className="bg-slate-50">
                                分类: {template.template_data.category}
                             </Badge>
                        )}
                        {template.template_data?.subtasks?.length > 0 && (
                             <Badge variant="secondary" className="bg-blue-50 text-blue-700">
                                {template.template_data.subtasks.length} 个子约定
                             </Badge>
                        )}
                    </div>
                    <div className="pt-2">
                         <Button asChild variant="outline" className="w-full border-dashed border-blue-200 text-blue-600 hover:bg-blue-50">
                             <Link to={`/Tasks?template=${template.id}`}>
                                <Wand2 className="w-4 h-4 mr-2" />
                                使用此模板
                             </Link>
                         </Button>
                    </div>
               </div>
            </CardContent>
          </Card>
        ))}
        {filteredTemplates.length === 0 && (
            <div className="col-span-full py-12 text-center text-slate-400 bg-slate-50 rounded-xl border-2 border-dashed border-slate-200">
                <StickyNote className="w-12 h-12 mx-auto mb-3 opacity-20" />
                <p>暂无模板，点击右上角新建</p>
            </div>
        )}
      </div>

      <TemplateEditor 
        open={isCreateOpen || !!editingTemplate} 
        onClose={() => {
            setIsCreateOpen(false);
            setEditingTemplate(null);
        }}
        template={editingTemplate}
        onSave={(data) => {
            if (editingTemplate) {
                updateMutation.mutate({ id: editingTemplate.id, data });
            } else {
                createMutation.mutate(data);
            }
        }}
      />
    </div>
  );
}

function TemplateEditor({ open, onClose, template, onSave }) {
    const [name, setName] = useState("");
    const [desc, setDesc] = useState("");
    const [taskData, setTaskData] = useState({
        title: "",
        description: "",
        priority: "medium",
        category: "personal",
        subtasks: []
    });

    React.useEffect(() => {
        if (template) {
            setName(template.name);
            setDesc(template.description);
            setTaskData(template.template_data || {});
        } else {
            setName("");
            setDesc("");
            setTaskData({
                title: "",
                description: "",
                priority: "medium",
                category: "personal",
                subtasks: []
            });
        }
    }, [template, open]);

    const handleSave = () => {
        if (!name) return toast.error("请输入模板名称");
        onSave({
            name,
            description: desc,
            template_data: taskData
        });
    };

    return (
        <Dialog open={open} onOpenChange={onClose}>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>{template ? "编辑模板" : "新建模板"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <Label>模板名称</Label>
                            <Input value={name} onChange={e => setName(e.target.value)} placeholder="例如：每日晨会" />
                        </div>
                        <div className="space-y-2">
                            <Label>模板描述</Label>
                            <Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="简要描述用途" />
                        </div>
                    </div>
                    
                    <div className="border-t pt-4">
                        <Label className="text-base font-semibold text-blue-600 mb-3 block">约定预设内容</Label>
                        <div className="space-y-4 bg-slate-50 p-4 rounded-xl">
                            <div className="space-y-2">
                                <Label>默认标题</Label>
                                <Input 
                                    value={taskData.title} 
                                    onChange={e => setTaskData({...taskData, title: e.target.value})} 
                                    placeholder="约定标题（创建时可修改）"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>默认描述</Label>
                                <Textarea 
                                    value={taskData.description} 
                                    onChange={e => setTaskData({...taskData, description: e.target.value})} 
                                    placeholder="详细描述、检查清单等..."
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>优先级</Label>
                                    <Select value={taskData.priority} onValueChange={v => setTaskData({...taskData, priority: v})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="low">低</SelectItem>
                                            <SelectItem value="medium">中</SelectItem>
                                            <SelectItem value="high">高</SelectItem>
                                            <SelectItem value="urgent">紧急</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>分类</Label>
                                    <Select value={taskData.category} onValueChange={v => setTaskData({...taskData, category: v})}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="work">工作</SelectItem>
                                            <SelectItem value="personal">个人</SelectItem>
                                            <SelectItem value="health">健康</SelectItem>
                                            <SelectItem value="study">学习</SelectItem>
                                            <SelectItem value="family">家庭</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label>预设子约定 ({taskData.subtasks?.length || 0})</Label>
                                    <Button size="sm" variant="ghost" onClick={() => setTaskData({
                                        ...taskData, 
                                        subtasks: [...(taskData.subtasks || []), { title: "", priority: "medium" }]
                                    })}>
                                        <Plus className="w-4 h-4 mr-1" /> 添加
                                    </Button>
                                </div>
                                <div className="space-y-2">
                                    {taskData.subtasks?.map((st, i) => (
                                        <div key={i} className="flex gap-2">
                                            <Input 
                                                value={st.title} 
                                                onChange={e => {
                                                    const newSt = [...taskData.subtasks];
                                                    newSt[i].title = e.target.value;
                                                    setTaskData({...taskData, subtasks: newSt});
                                                }}
                                                placeholder={`子约定 ${i+1}`}
                                                className="bg-white"
                                            />
                                            <Button size="icon" variant="ghost" onClick={() => {
                                                const newSt = taskData.subtasks.filter((_, idx) => idx !== i);
                                                setTaskData({...taskData, subtasks: newSt});
                                            }}>
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={onClose}>取消</Button>
                    <Button onClick={handleSave}>保存模板</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}