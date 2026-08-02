// 生成 .ics 日历文件，让未注册的被分享者也能在约定时间收到自己设备的提醒
function fmt(date) {
  return new Date(date).toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

export function downloadTaskIcs(task) {
  const start = task.reminder_time ? new Date(task.reminder_time) : new Date(Date.now() + 3600000);
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SoulSentry//Collaboration//CN",
    "BEGIN:VEVENT",
    `UID:${task.id}@soulsentry`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${(task.title || "共同约定").replace(/\n/g, " ")}`,
    `DESCRIPTION:${(task.description || "").replace(/\n/g, "\\n")}`,
    "BEGIN:VALARM",
    "TRIGGER:-PT15M",
    "ACTION:DISPLAY",
    "DESCRIPTION:约定提醒",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(task.title || "约定").slice(0, 20)}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}