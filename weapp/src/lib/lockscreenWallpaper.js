// 锁屏约定壁纸（小程序端）：把全部进行中的约定（含子约定）+ 勾选状态渲染成手机锁屏尺寸的壁纸图。
// 与 Web 端 src/lib/lockscreenWallpaper.js 同一套排版逻辑，仅导出方式不同：
// 这里用 wx.createOffscreenCanvas 离屏渲染后导出 tempFilePath，供预览与保存相册。
// 锁屏时钟占据顶部约 1/3，内容统一从 y≈780 开始排布，避免被时间遮挡。

export const WALLPAPER_WIDTH = 1170;
export const WALLPAPER_HEIGHT = 2532; // 9:19.5，主流全面屏比例

const FONT = '"PingFang SC", "Microsoft YaHei", Arial, sans-serif';

export const WALLPAPER_STYLES = [
  {
    key: "night",
    name: "深空蓝",
    from: "#333f68",
    to: "#222b49",
    ink: "#f7f4ee",
    soft: "rgba(247,244,238,0.66)",
    faint: "rgba(247,244,238,0.42)",
    accent: "#dcbd85",
    done: "#a9d8b2",
    line: "rgba(247,244,238,0.18)",
  },
  {
    key: "paper",
    name: "暖米纸",
    from: "#f6f2e9",
    to: "#e9e1d0",
    ink: "#2f3a55",
    soft: "rgba(47,58,85,0.62)",
    faint: "rgba(47,58,85,0.40)",
    accent: "#b98a4e",
    done: "#5f8f6a",
    line: "rgba(47,58,85,0.16)",
  },
  {
    key: "forest",
    name: "黛山青",
    from: "#274036",
    to: "#182a22",
    ink: "#f0efe4",
    soft: "rgba(240,239,228,0.64)",
    faint: "rgba(240,239,228,0.40)",
    accent: "#d8c78f",
    done: "#9fd0a8",
    line: "rgba(240,239,228,0.16)",
  },
  {
    key: "plum",
    name: "雾紫",
    from: "#41355a",
    to: "#2b2340",
    ink: "#f5f1f9",
    soft: "rgba(245,241,249,0.64)",
    faint: "rgba(245,241,249,0.40)",
    accent: "#d9b8d4",
    done: "#a8d8c0",
    line: "rgba(245,241,249,0.16)",
  },
];

export const getStyle = (key) =>
  WALLPAPER_STYLES.find((s) => s.key === key) || WALLPAPER_STYLES[0];

// 北京日期口径（与列表页 / 打卡封面一致），与用户设备时区无关
export const beijingDay = (t) =>
  new Date(new Date(t).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);

const isRecurring = (t) => !!t?.repeat_rule && t.repeat_rule !== "none";

// 重复约定「打卡不杀系列」：完成只看当天 done_today；普通约定看 status
export const isItemDone = (t) =>
  isRecurring(t) ? !!t.done_today : t?.status === "completed" || t?.status === "done";

/**
 * 从全量约定（parent_task_id=all）挑出锁屏壁纸条目：
 * 顶层约定（未完成 + 今日已完成；重复约定始终保留）+ 各自的全部直接子约定，
 * 未完成按提醒时间升序在前，今日已完成的划线沉底。
 * 清单不做数量截取（页面内可勾选任何一条）；壁纸绘制时由 buildRows 折叠超出的行。
 */
export function buildLockscreenItems(allTasks = []) {
  const list = Array.isArray(allTasks) ? allTasks : [];
  const today = beijingDay(Date.now());
  const doneToday = (t) => isItemDone(t) && t.completed_at && beijingDay(t.completed_at) === today;
  const visible = (t) =>
    t.status !== "archived" && (isRecurring(t) || !isItemDone(t) || doneToday(t));
  const byReminder = (a, b) => {
    const ta = a.reminder_time ? new Date(a.reminder_time).getTime() : Infinity;
    const tb = b.reminder_time ? new Date(b.reminder_time).getTime() : Infinity;
    return ta - tb;
  };

  const tops = list.filter((t) => !t.parent_task_id && visible(t));
  const pending = tops.filter((t) => !isItemDone(t)).sort(byReminder);
  const done = tops
    .filter(isItemDone)
    .sort((a, b) => new Date(b.completed_at || 0).getTime() - new Date(a.completed_at || 0).getTime());

  return [...pending, ...done].map((t) => ({
    id: t.id,
    title: t.title,
    done: isItemDone(t),
    subtasks: list
      .filter((s) => s.parent_task_id === t.id && visible(s))
      .map((s) => ({ id: s.id, title: s.title, done: isItemDone(s) })),
  }));
}

function truncateToWidth(ctx, text, maxWidth) {
  const str = String(text || "");
  if (ctx.measureText(str).width <= maxWidth) return str;
  let out = "";
  for (const ch of str) {
    if (ctx.measureText(out + ch + "…").width > maxWidth) break;
    out += ch;
  }
  return out + "…";
}

// 拍平成绘制行：父约定一行 + 子约定缩进行；超预算时末行折叠为「… 还有 N 项」
function buildRows(items, maxRows = 12) {
  const rows = [];
  (items || []).forEach((p) => {
    rows.push({ depth: 0, id: p.id, title: p.title, done: p.done });
    (p.subtasks || []).forEach((s) =>
      rows.push({ depth: 1, id: s.id, title: s.title, done: s.done })
    );
  });
  if (rows.length <= maxRows) return rows;
  const kept = rows.slice(0, maxRows - 1);
  kept.push({ depth: 0, more: rows.length - kept.length });
  return kept;
}

function drawCheckbox(ctx, x, y, size, done, style) {
  ctx.lineWidth = Math.max(2, size * 0.07);
  if (done) {
    ctx.fillStyle = style.done;
    ctx.strokeStyle = style.done;
  } else {
    ctx.fillStyle = "transparent";
    ctx.strokeStyle = style.soft;
  }
  ctx.beginPath();
  ctx.rect(x, y, size, size);
  if (done) ctx.fill();
  ctx.stroke();
  if (done) {
    ctx.strokeStyle = style.to;
    ctx.lineWidth = Math.max(3, size * 0.11);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(x + size * 0.24, y + size * 0.54);
    ctx.lineTo(x + size * 0.44, y + size * 0.73);
    ctx.lineTo(x + size * 0.78, y + size * 0.28);
    ctx.stroke();
    ctx.lineCap = "butt";
    ctx.lineJoin = "miter";
  }
}

/**
 * 在给定的 2d 上下文上绘制锁屏约定壁纸（浏览器 canvas 与小程序离屏 canvas 通用）。
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} opts
 * @param {Array} opts.items buildLockscreenItems 的结果
 * @param {object} opts.style WALLPAPER_STYLES 中的一项
 * @param {Date} [opts.date]
 */
export function renderWallpaper(ctx, { items = [], style, date = new Date() }) {
  const W = WALLPAPER_WIDTH;
  const H = WALLPAPER_HEIGHT;
  const pad = 96;

  // 背景：纵向微渐变
  const grd = ctx.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, style.from);
  grd.addColorStop(1, style.to);
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";

  // 顶部 0–700px 留给系统锁屏时钟，内容从 780 开始
  ctx.fillStyle = style.faint;
  ctx.font = `400 30px ${FONT}`;
  ctx.fillText("心栈 · SOULSENTRY", pad, 800);

  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  ctx.fillStyle = style.ink;
  ctx.font = `600 46px ${FONT}`;
  ctx.fillText(`${date.getMonth() + 1}月${date.getDate()}日 · 星期${week}`, pad, 876);

  const flatCount = items.reduce((n, p) => n + 1 + (p.subtasks || []).length, 0);
  const doneCount = items.reduce(
    (n, p) => n + (p.done ? 1 : 0) + (p.subtasks || []).filter((s) => s.done).length,
    0
  );
  if (flatCount > 0) {
    ctx.textAlign = "right";
    ctx.fillStyle = style.soft;
    ctx.font = `400 34px ${FONT}`;
    ctx.fillText(`今日 ${doneCount}/${flatCount}`, W - pad, 872);
    ctx.textAlign = "left";
  }

  // 细分隔线
  ctx.strokeStyle = style.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pad, 920);
  ctx.lineTo(W - pad, 920);
  ctx.stroke();

  if (items.length === 0) {
    ctx.textAlign = "center";
    ctx.fillStyle = style.ink;
    ctx.font = `500 46px ${FONT}`;
    ctx.fillText("今天还没有约定", W / 2, 1120);
    ctx.fillStyle = style.soft;
    ctx.font = `400 32px ${FONT}`;
    ctx.fillText("来心栈，和自己许下一个约定", W / 2, 1190);
    ctx.textAlign = "left";
  } else {
    let y = 1004; // 第一行文字基线
    const rows = buildRows(items);
    for (const row of rows) {
      if (row.more) {
        ctx.fillStyle = style.faint;
        ctx.font = `400 32px ${FONT}`;
        ctx.fillText(`… 还有 ${row.more} 项约定`, pad, y);
        y += 112;
        continue;
      }
      const isSub = row.depth > 0;
      const boxSize = isSub ? 34 : 44;
      const boxX = isSub ? pad + 96 : pad;
      const textX = boxX + boxSize + (isSub ? 26 : 32);
      const maxTextW = W - pad - textX;

      drawCheckbox(ctx, boxX, y - boxSize + 6, boxSize, row.done, style);

      ctx.font = `${row.done ? 400 : 500} ${isSub ? 36 : 42}px ${FONT}`;
      ctx.fillStyle = row.done ? style.soft : style.ink;
      const text = truncateToWidth(ctx, row.title, maxTextW);
      ctx.fillText(text, textX, y);

      if (row.done) {
        const tw = ctx.measureText(text).width;
        ctx.strokeStyle = style.faint;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(textX, y - (isSub ? 12 : 14));
        ctx.lineTo(textX + tw, y - (isSub ? 12 : 14));
        ctx.stroke();
      }
      y += isSub ? 88 : 112;
    }
  }

  // 今日进度条（底部）
  if (flatCount > 0) {
    const barY = H - 240;
    const barW = W - pad * 2;
    ctx.fillStyle = style.line;
    ctx.fillRect(pad, barY, barW, 8);
    if (doneCount > 0) {
      ctx.fillStyle = style.accent;
      ctx.fillRect(pad, barY, Math.max(16, (barW * doneCount) / flatCount), 8);
    }
  }

  // 底部品牌语
  ctx.textAlign = "center";
  ctx.fillStyle = style.faint;
  ctx.font = `400 28px ${FONT}`;
  ctx.fillText("—— 心栈 · 从容地记住每一声心动", W / 2, H - 150);
  ctx.textAlign = "left";
}

/**
 * 生成锁屏约定壁纸，返回 Promise<tempFilePath>（失败返回 ""）
 * @param {Array} items buildLockscreenItems 的结果
 * @param {string} styleKey WALLPAPER_STYLES 的 key
 */
export function generateWallpaper(items, styleKey) {
  return new Promise((resolve) => {
    try {
      if (process.env.TARO_ENV !== "weapp" || typeof wx === "undefined" || !wx.createOffscreenCanvas) {
        return resolve("");
      }
      const canvas = wx.createOffscreenCanvas({ type: "2d", width: WALLPAPER_WIDTH, height: WALLPAPER_HEIGHT });
      const ctx = canvas.getContext("2d");
      renderWallpaper(ctx, { items, style: getStyle(styleKey) });
      wx.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width: WALLPAPER_WIDTH,
        height: WALLPAPER_HEIGHT,
        destWidth: WALLPAPER_WIDTH,
        destHeight: WALLPAPER_HEIGHT,
        success: (res) => resolve(res.tempFilePath || ""),
        fail: () => resolve(""),
      });
    } catch (_e) {
      resolve("");
    }
  });
}
