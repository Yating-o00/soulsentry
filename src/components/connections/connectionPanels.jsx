import { base44 } from "@/api/base44Client";
import { toast } from "sonner";

const invoke = async (name, payload = {}) => (await base44.functions.invoke(name, payload)).data;

async function syncCalendar() {
  let cursor = 0, synced = 0, done = false, total = null;
  const id = toast.loading("正在连接 Google 日历…");
  try {
    while (!done) {
      const r = await invoke("bulkSyncTasksToCalendar", { cursor, batch_size: 25 });
      total ??= r.eligible;
      synced += r.synced || 0; cursor = r.cursor; done = r.done;
      toast.loading(`正在同步 ${synced}/${total}…`, { id });
    }
  } finally {
    toast.dismiss(id);
  }
  return `已同步 ${synced} 个约定到日历，日历会在开始前 10 分钟弹出提醒`;
}

// 每个连接面板的配置；soon=true 表示尚未开放
export const PANELS = {
  calendar: {
    title: "日历 · 同步提醒",
    desc: "把有时间的约定推送到 Google 日历，之后修改会自动同步；日历在开始前 10 分钟弹窗、30 分钟邮件提醒。",
    actions: [{ label: "立即同步到日历", run: syncCalendar }],
  },
  todo: {
    title: "待办 · 并入约定守护",
    desc: "把 Google Tasks 里未完成的待办并入心栈约定，由心栈到点提醒与守护；也可把今天的约定推回待办清单。",
    actions: [
      { label: "导入待办为约定", run: async () => { const r = await invoke("importGoogleTasks"); return r.imported ? `已并入 ${r.imported} 条待办` : "没有新的待办需要并入"; } },
      { label: "推送今日约定到待办", run: async () => (await invoke("syncToGoogleTasks")).message },
    ],
  },
  location: {
    title: "位置 · 地理围栏",
    desc: "保存常去的地点（家、公司、健身房…），进入或离开时自动提醒相关约定。",
    actions: [{ label: "管理地点与围栏", run: async () => { window.location.href = "/Notifications?tab=map"; return "正在打开地点管理"; } }],
  },
  contacts: { soon: true, title: "通讯录", desc: "读取联系人，帮助心栈理解你的社交关系。" },
  health: { soon: true, title: "健康", desc: "苹果健康 / 华为健康的运动数据仅能在手机原生 App 中读取，网页版暂不支持。" },
  music: { soon: true, title: "音乐", desc: "为专注、运动、睡前等约定唤起合适的音乐。" },
  photos: { soon: true, title: "照片", desc: "把重要瞬间嵌入约定与心签。" },
};