import { httpRequest } from "@/api/httpClient";
import { buildRunningLogPatch, buildRunnerProfile, formatPace, todayKeyBJ } from "@/lib/running";

/**
 * 搭子对话里的「随口记录」落到真实数据：
 * - 跑步：识别出的跑量写进 state.logs（与手动记录、截图识别同一条数据链）
 * - 读书：今日分钟数、读书笔记、读完状态、想读队列，并在每天的读书打卡约定上自动打卡
 * - 学习 / 早起：写进 state.captures，并在对应打卡约定上自动打卡
 * - 旅行 / 自定义搭子：写进 state.captures，保留可回看的日常记录
 *
 * 后端只负责从对话里提取 capture（见 buildCaptureSpec），这里统一做校验和落库，
 * 返回 { patch, receipt }：patch 交给 useBuddyState 一次性合并，receipt 作为对话里的回执卡片。
 */

const MIN_CONFIDENCE = 0.6;

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function cleanText(value, max = 120) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanBook(value) {
  return cleanText(value, 40).replace(/^《|》$/g, "").trim();
}

function normalizeCapture(capture) {
  let raw = capture;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch (_error) {
      return null;
    }
  }
  if (!raw || typeof raw !== "object" || !raw.kind || raw.kind === "none") return null;
  const confidence = raw.confidence == null ? 0.75 : Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < MIN_CONFIDENCE) return null;
  let data = raw.data;
  if (typeof data === "string") {
    try {
      data = JSON.parse(data);
    } catch (_error) {
      data = null;
    }
  }
  return {
    ...raw,
    data: data && typeof data === "object" && !Array.isArray(data) ? data : {},
    checkin: raw.checkin === true,
    summary: cleanText(raw.summary, 30),
  };
}

function sanitizeCaptureData(data) {
  const out = {};
  for (const [key, value] of Object.entries(data).slice(0, 10)) {
    if (typeof value === "string") out[key] = value.trim().slice(0, 200);
    else if (typeof value === "number" || typeof value === "boolean" || value === null) out[key] = value;
  }
  return out;
}

function makeCaptureRecord(kind, data, summary, today) {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    day: today,
    kind,
    topic: cleanText(data.topic || summary, 40),
    text: cleanText(data.note || data.summary || summary, 120),
    data: sanitizeCaptureData(data),
    at: new Date().toISOString(),
  };
}

function appendCapture(state, record) {
  const list = Array.isArray(state.captures) ? state.captures : [];
  return [...list, record].slice(-60);
}

/** 读书：分钟数 / 笔记 / 读完 / 换读，一次合并成一个 state patch */
function buildReadingPatch(state, data, today) {
  const patch = {};
  const details = [];
  const book = cleanBook(data.book);
  const currentBook = book || cleanBook(state.current_book) || "在读的书";

  const minutes = Math.max(0, Math.min(600, toNumber(data.minutes) ?? 0));
  const pages = Math.max(0, Math.min(2000, toNumber(data.pages_read) ?? 0));
  if (minutes > 0) {
    const prev = Math.max(0, toNumber(state.mins?.[today]) ?? 0);
    patch.mins = { [today]: Math.round((prev + minutes) * 10) / 10 };
    details.push(`+${minutes} 分钟`);
  }
  if (pages > 0) details.push(`${pages} 页`);

  if (book) {
    if (book !== cleanBook(state.current_book)) {
      patch.current_book = book;
      patch.daily_question = null;
    }
    details.unshift(`《${book}》`);
  }

  const noteText = cleanText(data.summary, 80) || cleanText(data.quote, 120);
  if (noteText) {
    const notes = Array.isArray(state.notes) ? state.notes : [];
    const last = notes[notes.length - 1];
    const duplicated = last && last.day === today && last.text === noteText;
    if (!duplicated) {
      patch.notes = [
        ...notes,
        {
          text: noteText,
          ...(cleanText(data.quote, 120) ? { quote: cleanText(data.quote, 120) } : {}),
          book: currentBook,
          day: today,
          reply: "",
          question: "",
          source: "chat",
        },
      ].slice(-200);
      details.push("已存入读书笔记");
    }
  }

  if (data.finished === true && book) {
    const doneList = Array.isArray(state.shelf_done) ? state.shelf_done : [];
    if (!doneList.some((item) => cleanBook(item?.title) === book)) {
      const noteCount = (Array.isArray(state.notes) ? state.notes : []).filter(
        (note) => cleanBook(note?.book) === book
      ).length;
      patch.shelf_done = [
        ...doneList,
        { title: book, finished_at: today, notes: noteCount + (noteText ? 1 : 0) },
      ];
      details.push("已读完");
    }
    const want = Array.isArray(state.shelf_want) ? state.shelf_want : [];
    const readingSameBook = !state.current_book || cleanBook(state.current_book) === book;
    if (readingSameBook && want[0]) {
      patch.current_book = want[0];
      patch.shelf_want = want.slice(1);
      patch.daily_question = null;
    }
  }

  return { patch, details };
}

function buildRunningPatch(state, profile, data, today) {
  const distance = Math.max(0, toNumber(data.distance_km) ?? 0);
  const duration = Math.max(0, toNumber(data.duration_min) ?? 0);
  if (!distance && !duration) return null;

  const parsedDate = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || "")) ? String(data.date) : today;
  const result = buildRunningLogPatch(
    state,
    {
      date: parsedDate,
      distance_km: distance || "",
      duration_min: duration || "",
      avg_hr: toNumber(data.avg_hr) > 0 ? toNumber(data.avg_hr) : "",
      note: cleanText(data.note, 80),
      source: "chat",
    },
    buildRunnerProfile(profile?.answers || {})
  );
  if (!result) return null;

  const { log } = result;
  const pace = log.distance_km > 0 ? formatPace((log.duration_min * 60) / log.distance_km) : null;
  const detail = `${log.date} · ${log.distance_km} km · ${log.duration_min} 分钟${pace ? ` · ${pace}` : ""}`;
  return { patch: result.patchData, detail };
}

/**
 * @returns {Promise<{patch: object, receipt: {kind: string, title: string, detail: string}} | null>}
 */
export async function applyBuddyCapture({
  buddyId,
  capture,
  state = {},
  profile,
  projectTask,
  attachments = [],
  queryClient,
}) {
  const parsed = normalizeCapture(capture);
  if (!parsed) return null;

  const today = todayKeyBJ();
  const data = parsed.data;
  let patch = {};
  let title = "已记入日常记录";
  let detail = parsed.summary;

  if (buddyId === "running") {
    const applied = buildRunningPatch(state, profile, data, today);
    if (!applied) return null;
    patch = applied.patch;
    title = "已同步到跑步记录";
    detail = applied.detail;
  } else if (buddyId === "reading") {
    const applied = buildReadingPatch(state, data, today);
    patch = applied.patch;
    const hasSomething =
      Object.keys(patch).length > 0 ||
      (parsed.checkin && projectTask?.category === "checkin") ||
      (toNumber(data.minutes) ?? 0) > 0;
    if (!hasSomething) return null;
    title = "已同步到读书记录";
    detail = applied.details.filter(Boolean).join(" · ") || parsed.summary;
  } else {
    const record = makeCaptureRecord(parsed.kind, data, parsed.summary, today);
    patch = { captures: appendCapture(state, record) };
    if (parsed.kind === "travel_note") {
      title = "已记入旅行手记";
      detail = cleanText(data.note || data.summary, 60) || (data.dest ? cleanText(data.dest, 30) : "");
    } else if (parsed.kind === "wake_log") {
      title = "已记入早起记录";
      detail = data.wake_time
        ? `${cleanText(data.wake_time, 10)} 起床`
        : cleanText(data.note || parsed.summary, 40);
    } else if (parsed.kind === "study_log") {
      title = "已记入学习记录";
      detail =
        [
          cleanText(data.topic, 30),
          (toNumber(data.minutes) ?? 0) > 0 ? `${data.minutes} 分钟` : "",
          cleanText(data.note, 30),
        ]
          .filter(Boolean)
          .join(" · ") || cleanText(parsed.summary, 40);
    } else {
      title = "已记入日常记录";
      detail = cleanText(data.topic || data.note || parsed.summary, 60);
    }
  }

  // 今日打卡：只对「每天打卡」的项目约定生效（读书 / 学习 / 早起），跑步和普通项目不写打卡
  let checkinState = null;
  if (projectTask?.id && projectTask.category === "checkin") {
    const shouldCheckin =
      parsed.checkin ||
      (buddyId === "reading" && ((toNumber(data.minutes) ?? 0) > 0 || (toNumber(data.pages_read) ?? 0) > 0));
    if (shouldCheckin) {
      const photo = attachments.find((att) => String(att?.type || "").startsWith("image/"));
      try {
        await httpRequest(`/api/tasks/${projectTask.id}/checkins`, {
          method: "POST",
          body: {
            note: cleanText(parsed.summary || data.note, 200) || `来自${buddyId === "reading" ? "读书" : ""}搭子的对话记录`,
            ...(photo?.url ? { photo_url: photo.url } : {}),
            source: "buddy_chat",
          },
        });
        checkinState = "done";
        queryClient?.invalidateQueries({ queryKey: ["checkins", projectTask.id] });
        queryClient?.invalidateQueries({ queryKey: ["tasks"] });
      } catch (error) {
        checkinState =
          error?.status === 409 || error?.data?.error === "ALREADY_CHECKED_TODAY" ? "already" : "failed";
      }
    }
  }

  if (checkinState === "done") detail = [detail, "今日已打卡"].filter(Boolean).join(" · ");
  if (checkinState === "already") detail = [detail, "今天已打过卡"].filter(Boolean).join(" · ");
  if (checkinState === "failed") detail = [detail, "打卡未同步，可在打卡页补一次"].filter(Boolean).join(" · ");

  return {
    patch,
    receipt: { kind: parsed.kind, title, detail, checkin: checkinState },
  };
}
