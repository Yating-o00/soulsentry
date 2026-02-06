import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export function useTaskTranslation() {
  const [isTranslating, setIsTranslating] = useState(false);
  const queryClient = useQueryClient();

  const translateTask = async (task, subtasks = []) => {
    if (isTranslating) return;
    setIsTranslating(true);
    const toastId = toast.loading("正在准备翻译...");

    try {
      if (!task || !task.title) {
        throw new Error("任务信息不完整");
      }

      // Language detection logic
      const allText = (task.title || "") + (task.description || "");
      if (!allText.trim()) {
        toast.dismiss(toastId);
        setIsTranslating(false);
        return;
      }

      const chineseChars = (allText.match(/[\u4e00-\u9fa5]/g) || []).length;
      const nonWhitespace = allText.replace(/\s/g, "").length || 1;
      const isChinese = chineseChars > nonWhitespace * 0.3;

      const targetLang = isChinese ? "English" : "Simplified Chinese";
      const targetLangDisplay = isChinese ? "英文" : "中文";

      toast.message(`正在翻译为${targetLangDisplay}...`, { id: toastId });

      // Prepare data
      const subtasksList = subtasks.map(st => ({
        id: st.id,
        title: st.title,
        description: st.description || ""
      }));

      const notesList = (task.notes || []).map((note, idx) => ({
        index: idx,
        content: note.content
      }));

      // Call backend function
      const { data: res, error } = await base44.functions.invoke('translateTask', {
        title: task.title,
        description: task.description,
        subtasks: subtasksList,
        notes: notesList,
        targetLang
      });

      if (error) throw new Error(error);

      if (res && res.title) {
        // Update main task
        await base44.entities.Task.update(task.id, {
          title: res.title,
          description: res.description || "",
          notes: res.notes && res.notes.length > 0 ?
            (task.notes || []).map((note, idx) => {
              const translated = res.notes.find(n => n.index === idx);
              return translated ? { ...note, content: translated.content } : note;
            }) : task.notes
        });

        // Update subtasks
        if (res.subtasks && res.subtasks.length > 0) {
          const updatePromises = res.subtasks.map(translatedSt => {
            if (!translatedSt.id) return null;
            return base44.entities.Task.update(translatedSt.id, {
              title: translatedSt.title,
              description: translatedSt.description || ""
            });
          }).filter(Boolean);

          await Promise.all(updatePromises);
        }

        // Invalidate queries
        queryClient.invalidateQueries({ queryKey: ['tasks'] });
        queryClient.invalidateQueries({ queryKey: ['subtasks'] });
        queryClient.invalidateQueries({ queryKey: ['task', task.id] });

        toast.success(`✅ 已翻译为${targetLangDisplay}`, { id: toastId });
      } else {
        throw new Error("翻译未返回有效结果");
      }
    } catch (error) {
      console.error("翻译失败:", error);
      toast.error(`翻译服务出错: ${error.message || "未知错误"}`, { id: toastId });
    } finally {
      setIsTranslating(false);
    }
  };

  return { translateTask, isTranslating };
}