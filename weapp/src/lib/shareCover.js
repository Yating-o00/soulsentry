// 打卡约定的微信转发封面图（onShareAppMessage 的 imageUrl）：
// 5:4 极简装帧——米色纸面 + 双线细框 + 宋体大数字「N 次赴约」+ 朱砂「如约」印
// + 细分隔线下的进度行与今日动态（✓ 今日勾掉的子约定划线、＋ 今日新增）+ 心栈记金句。
// onShareAppMessage 必须同步返回，所以封面在卡片数据到位后预生成、缓存 tempFilePath。

const W = 640;
const H = 512; // 微信分享封面推荐 5:4
const FONT = '"PingFang SC", "Microsoft YaHei", Arial, sans-serif';
const SERIF = '"Songti SC", "STSong", "SimSun", serif'; // 书封式宋体，极简高级感

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

      // 极简装帧 · 主题品牌蓝主色调：微渐变蓝底 + 暖白文字 + 朱砂印点睛
      const INK = "#f7f4ee"; // 暖白主文字
      const INK_SOFT = "rgba(247,244,238,0.72)";
      const INK_FAINT = "rgba(247,244,238,0.50)";
      const TEXT = "rgba(247,244,238,0.92)";
      const SAGE = "#a9d8b2";
      const GOLD = "#dcbd85";
      const SEAL_RED = "#d06050";

      // 主题品牌蓝底（纵向微渐变，克制不花哨）
      const grd = ctx.createLinearGradient(0, 0, 0, H);
      grd.addColorStop(0, "#3a4a7a");
      grd.addColorStop(1, "#2e3a60");
      ctx.fillStyle = grd;
      ctx.fillRect(0, 0, W, H);

      const pad = 48;

      // 函套式双线细边框
      ctx.strokeStyle = "rgba(247,244,238,0.32)";
      ctx.lineWidth = 1;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      ctx.strokeStyle = "rgba(247,244,238,0.14)";
      ctx.lineWidth = 0.5;
      ctx.strokeRect(22, 22, W - 44, H - 44);

      // 顶部品牌行
      ctx.textBaseline = "alphabetic";
      ctx.textAlign = "left";
      ctx.fillStyle = INK_SOFT;
      ctx.font = `400 14px ${FONT}`;
      ctx.fillText("心栈 · SOULSENTRY", pad, 62);

      // 朱砂「如约」印章（右上，正置双圈，签名式收束）
      ctx.save();
      ctx.translate(W - pad - 4, 56);
      ctx.strokeStyle = SEAL_RED;
      ctx.fillStyle = SEAL_RED;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.arc(0, 0, 17, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `600 10px ${SERIF}`;
      ctx.textAlign = "center";
      ctx.fillText("如", 0, -2);
      ctx.fillText("约", 0, 10);
      ctx.restore();

      // 大数字「N 次赴约」：宋体大字号，书封式排版
      ctx.textAlign = "left";
      ctx.fillStyle = INK;
      ctx.font = `800 84px ${SERIF}`;
      const numText = String(total);
      ctx.fillText(numText, pad, 190);
      const numWidth = ctx.measureText(numText).width;
      ctx.fillStyle = INK_SOFT;
      ctx.font = `400 17px ${FONT}`;
      ctx.fillText("次  赴  约", pad + numWidth + 20, 187);

      // 约定标题（宋体，最多 2 行）
      ctx.fillStyle = INK;
      ctx.font = `600 30px ${SERIF}`;
      ctx.textBaseline = "top";
      const titleLines = wrapText(ctx, String(title || "未命名").trim(), W - pad * 2, 2);
      titleLines.forEach((line, i) => ctx.fillText(line, pad, 226 + i * 40));
      const titleBottom = 226 + titleLines.length * 40;

      // 细分隔线
      const ruleY = titleBottom + 16;
      ctx.strokeStyle = "rgba(247,244,238,0.20)";
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(pad, ruleY);
      ctx.lineTo(W - pad, ruleY);
      ctx.stroke();

      // 进度行：子约定完成度 / 坚持天数 / 今日已打卡
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
      if (doneToday) metaParts.push("今日已打卡");
      const metaY = ruleY + 24;
      ctx.fillStyle = INK_SOFT;
      ctx.font = `400 15px ${FONT}`;
      ctx.fillText(metaParts.join("  ·  "), pad, metaY);

      // 今日动态：今日在卡片上做的事点名呈现——勾掉的子约定（✓ 细划线）、新增的子约定（＋）
      const doneIds = new Set(doneTodayList.map((s) => s.id));
      const newTodayList = (subtasks || []).filter((s) => s.created_date && dayOf(s.created_date) === today && !doneIds.has(s.id));
      const labelY = metaY + 30;
      const firstItemY = labelY + 26;
      const maxLines = Math.max(1, Math.min(4, Math.floor((H - 58 - firstItemY) / 30)));
      const activityLines = [];
      doneTodayList.slice(0, 3).forEach((s) => activityLines.push({ icon: "✓", text: s.title, struck: true }));
      if (doneTodayList.length > 3) activityLines.push({ icon: "✓", text: `等 ${doneTodayList.length} 项完成`, muted: true });
      const roomForNew = Math.max(0, maxLines - activityLines.length);
      newTodayList.slice(0, roomForNew).forEach((s) => activityLines.push({ icon: "＋", text: s.title }));
      if (newTodayList.length > roomForNew && activityLines.length < maxLines) {
        activityLines.push({ icon: "＋", text: `等 ${newTodayList.length} 项新增`, muted: true });
      }
      activityLines.length = Math.min(activityLines.length, maxLines);
      if (activityLines.length > 0) {
        ctx.fillStyle = INK_FAINT;
        ctx.font = `500 13px ${FONT}`;
        ctx.fillText("— 今日动态", pad, labelY);
        let ly = firstItemY;
        activityLines.forEach((line) => {
          ctx.font = `500 18px ${FONT}`;
          ctx.fillStyle = line.icon === "✓" ? SAGE : GOLD;
          ctx.fillText(line.icon, pad, ly);
          const prefixW = ctx.measureText(line.icon).width;
          ctx.fillStyle = line.muted ? INK_SOFT : TEXT;
          const text = truncateToWidth(ctx, line.text, W - pad * 2 - prefixW - 12);
          const tx = pad + prefixW + 12;
          ctx.fillText(text, tx, ly);
          if (line.struck) {
            const w = ctx.measureText(text).width;
            ctx.strokeStyle = "rgba(247,244,238,0.35)";
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(tx, ly + 9);
            ctx.lineTo(tx + w, ly + 9);
            ctx.stroke();
          }
          ly += 30;
        });
      }

      // 底部金句（固定底部，今日动态块在其上方自适应）
      ctx.fillStyle = INK_FAINT;
      ctx.font = `400 14px ${FONT}`;
      ctx.fillText(`—— 心栈记 · ${quote}`.slice(0, 36), pad, H - 46);

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
