// 打卡约定的微信转发封面图（onShareAppMessage 的 imageUrl）：
// 5:4 品牌蓝渐变底 + 大数字「N 次赴约」+ 约定标题 + 子约定进度/坚持天数
// + 今日动态（✓ 今日勾掉的子约定划线呈现、＋ 今日新增的子约定）+ 心栈记金句。
// onShareAppMessage 必须同步返回，所以封面在卡片数据到位后预生成、缓存 tempFilePath。

const W = 640;
const H = 512; // 微信分享封面推荐 5:4
const FONT = '"PingFang SC", "Microsoft YaHei", Arial, sans-serif';

function wrapText(ctx, text, maxWidth, maxLines = 2) {
  const lines = [];
  let line = "";
  for (const ch of String(text || "")) {
    if (ch === "\n") {
      lines.push(line);
      line = "";
      if (lines.length >= maxLines) return lines;
      continue;
    }
    if (ctx.measureText(line + ch).width > maxWidth && line) {
      lines.push(line);
      line = ch;
      if (lines.length >= maxLines) return lines;
    } else {
      line += ch;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  return lines;
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

/**
 * 生成打卡约定转发封面，返回 Promise<tempFilePath>（失败返回 ""，调用方降级为默认截图）
 * @param {object} opts
 * @param {string} opts.title 约定标题
 * @param {number} opts.total 累计打卡次数
 * @param {string|null} opts.firstAt 首次打卡时间 ISO
 * @param {Array} opts.subtasks 子约定树（含 status/completed_at/created_date），用于呈现当日动态
 * @param {boolean} opts.doneToday 今天是否已打卡
 * @param {string} opts.quote 心栈记金句
 */
export function generateCheckinCover({ title, total = 0, firstAt = null, subtasks = [], doneToday = false, quote = "每一次都算数。" }) {
  return new Promise((resolve) => {
    try {
      if (process.env.TARO_ENV !== "weapp" || typeof wx === "undefined" || !wx.createOffscreenCanvas) {
        return resolve("");
      }
      const canvas = wx.createOffscreenCanvas({ type: "2d", width: W, height: H });
      const ctx = canvas.getContext("2d");

      // 当日动态（按北京时间）：今日完成的子约定 / 今日新增的子约定
      const dayOf = (t) => new Date(new Date(t).getTime() + 8 * 3600 * 1000).toISOString().slice(0, 10);
      const today = dayOf(Date.now());
      const isDone = (s) => s.status === "completed" || s.status === "done";
      const doneTodayList = (subtasks || []).filter((s) => isDone(s) && s.completed_at && dayOf(s.completed_at) === today);

      // 品牌蓝渐变底
      const grd = ctx.createLinearGradient(0, 0, W, H);
      grd.addColorStop(0, "#2d3a5f");
      grd.addColorStop(0.55, "#384877");
      grd.addColorStop(1, "#3b5aa2");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      const pad = 40;

      // 顶部品牌行
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = `400 18px ${FONT}`;
      ctx.fillText("心栈 SOULSENTRY", pad, 30);

      // 如约印章（右上，斜置双圈）
      ctx.save();
      ctx.translate(W - pad - 34, 46);
      ctx.rotate((-12 * Math.PI) / 180);
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 30, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, 23, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.6)";
      ctx.font = `700 16px ${FONT}`;
      ctx.textAlign = "center";
      ctx.fillText("如", 0, -16);
      ctx.fillText("约", 0, 1);
      ctx.restore();

      // 大数字「N 次赴约」
      ctx.textAlign = "left";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#ffffff";
      ctx.font = `800 76px ${FONT}`;
      const numText = String(total);
      ctx.fillText(numText, pad, 158);
      const numWidth = ctx.measureText(numText).width;
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = `400 22px ${FONT}`;
      ctx.fillText("次 赴 约", pad + numWidth + 18, 154);

      // 约定标题（最多 2 行）
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 28px ${FONT}`;
      ctx.textBaseline = "top";
      const titleLines = wrapText(ctx, String(title || "未命名").trim(), W - pad * 2, 2);
      titleLines.forEach((line, i) => ctx.fillText(line, pad, 184 + i * 40));

      // 进度行：子约定完成度 / 坚持天数 / 今日已打卡（当日条目在下面逐条列出）
      const metaParts = [];
      if (Array.isArray(subtasks) && subtasks.length > 0) {
        const doneCount = subtasks.filter(isDone).length;
        metaParts.push(`子约定 ${doneCount}/${subtasks.length}`);
      }
      if (firstAt) {
        const first = new Date(firstAt);
        if (!isNaN(first.getTime())) {
          const dayCount = Math.max(1, Math.floor((Date.now() - first.getTime()) / 86400000) + 1);
          metaParts.push(`第 ${dayCount} 天`);
        }
      }
      if (doneToday) metaParts.unshift("今日已打卡");
      const metaY = 184 + titleLines.length * 40 + 14;
      if (metaParts.length > 0) {
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.font = `500 19px ${FONT}`;
        ctx.fillText(metaParts.join(" · "), pad, metaY);
      }

      // 今日动态：今日在卡片上做的事点名呈现——勾掉的子约定（✓ 划线）、新增的子约定（＋）
      const doneIds = new Set(doneTodayList.map((s) => s.id));
      const newTodayList = (subtasks || []).filter((s) => s.created_date && dayOf(s.created_date) === today && !doneIds.has(s.id));
      const MAX_ACTIVITY_LINES = 4;
      const activityLines = [];
      doneTodayList.slice(0, 3).forEach((s) => activityLines.push({ icon: "✓", text: s.title, struck: true }));
      if (doneTodayList.length > 3) activityLines.push({ icon: "✓", text: `等 ${doneTodayList.length} 项完成`, muted: true });
      const roomForNew = Math.max(0, MAX_ACTIVITY_LINES - activityLines.length);
      newTodayList.slice(0, roomForNew).forEach((s) => activityLines.push({ icon: "＋", text: s.title }));
      if (newTodayList.length > roomForNew && activityLines.length < MAX_ACTIVITY_LINES) {
        activityLines.push({ icon: "＋", text: `等 ${newTodayList.length} 项新增`, muted: true });
      }
      if (activityLines.length > 0) {
        const blockStart = metaY + 32;
        ctx.textBaseline = "top";
        ctx.fillStyle = "rgba(255,255,255,0.55)";
        ctx.font = `600 15px ${FONT}`;
        ctx.fillText("今日动态", pad, blockStart);
        let ly = blockStart + 28;
        activityLines.forEach((line) => {
          ctx.font = `500 20px ${FONT}`;
          ctx.fillStyle = line.icon === "✓" ? "#8fe3ae" : "#ffd479";
          ctx.fillText(line.icon, pad, ly);
          const prefixW = ctx.measureText(line.icon).width;
          ctx.fillStyle = line.muted ? "rgba(255,255,255,0.62)" : "rgba(255,255,255,0.94)";
          const text = truncateToWidth(ctx, line.text, W - pad * 2 - prefixW - 12);
          const tx = pad + prefixW + 12;
          ctx.fillText(text, tx, ly);
          if (line.struck) {
            const w = ctx.measureText(text).width;
            ctx.strokeStyle = "rgba(255,255,255,0.35)";
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(tx, ly + 9);
            ctx.lineTo(tx + w, ly + 9);
            ctx.stroke();
          }
          ly += 28;
        });
      }

      // 底部金句（固定底部，今日动态块在其上方自适应）
      ctx.fillStyle = "rgba(255,255,255,0.62)";
      ctx.font = `400 16px ${FONT}`;
      ctx.fillText(`——心栈记 · ${quote}`.slice(0, 34), pad, H - 44);

      wx.canvasToTempFilePath({
        canvas,
        x: 0,
        y: 0,
        width: W,
        height: H,
        destWidth: W,
        destHeight: H,
        success: (res) => resolve(res.tempFilePath || ""),
        fail: () => resolve("")
      });
    } catch (_e) {
      resolve("");
    }
  });
}
