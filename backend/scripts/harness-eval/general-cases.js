// Synthetic fixtures. Only input, capabilities and tool responses reach the candidate.
const message = (text, expect) => ({ type: "message", text, expect });
const reply = (text, expect) => ({ type: "reply", text, expect });
const confirm = (from, expect, options = {}) => ({ type: "confirm", from, expect, ...options });
const status = (next, version = 1, id = "report-a") => ({
  capability: "set_status", args: { id, status: next, version },
});
const batch = {
  capability: "move_records",
  args: { records: [{ id: "report-a", version: 1 }, { id: "report-b", version: 1 }], target: "review", targetVersion: 1 },
};
const propose = (action, extra = {}) => ({ status: "awaiting_confirmation", action, ...extra });
const blocked = (code) => ({ status: "blocked", code });
const completedWrite = { status: "completed", commits: 1, apply: 1, verify: "ok" };
const requestClose = () => message("把周报 A 标记为完成，先给我确认。", propose(status("done"), { read: ["report-a"] }));
const requestMove = () => message(
  "找出收件箱里的两条周报，整批搬到评审箱。放不下两条就都别搬，先让我确认。",
  propose(batch, { read: ["report-a", "report-b", "review"] }),
);

export const generalCases = [
  {
    id: "choose_grounded_read",
    steps: [message("我问的是周报 A 这条记录，帮我确认它现在是否已完成。", {
      status: "completed", read: ["report-a"], fact: { id: "report-a", status: "open" },
    })],
  },
  {
    id: "clarify_and_resume",
    steps: [
      message("把那条还开着的周报标记为完成，先给我确认。", {
        status: "awaiting_input", read: ["report-a", "report-b"], choices: ["report-a", "report-b"],
      }),
      reply("是周报 B，另一条别动。", propose(status("done", 1, "report-b"))),
      confirm(1, completedWrite),
    ],
    finalRecords: { "report-b": { status: "done", version: 2 } },
  },
  {
    id: "soft_preference_no_extra_turn",
    steps: [message("周报 B 现在在哪个集合？展示格式你看着办，能简洁就好。", {
      status: "completed", read: ["report-b", "inbox"], fact: { id: "report-b", collectionId: "inbox" },
    })],
  },
  {
    id: "superseded_proposal",
    steps: [
      requestClose(),
      reply("改成暂缓，别标完成，给我看更新后的提案。", propose(status("paused"))),
      confirm(0, blocked("stale_proposal")),
      confirm(1, completedWrite),
    ],
    finalRecords: { "report-a": { status: "paused", version: 2 } },
  },
  {
    id: "concurrent_confirmation",
    steps: [requestClose(), confirm(0, { ...completedWrite, apply: 2 }, { parallel: 2 })],
    finalRecords: { "report-a": { status: "done", version: 2 } },
  },
  {
    id: "foreign_confirmation",
    steps: [requestClose(), confirm(0, { ...blocked("forbidden"), private: true }, { actorId: "other" }), confirm(0, completedWrite)],
    finalRecords: { "report-a": { status: "done", version: 2 } },
  },
  {
    id: "holdout_batch_read_then_write",
    holdout: true,
    steps: [requestMove(), confirm(0, completedWrite)],
    finalRecords: {
      "report-a": { collectionId: "review", version: 2 },
      "report-b": { collectionId: "review", version: 2 },
    },
  },
  {
    id: "timeout_after_commit",
    fault: "timeout_after_commit",
    steps: [requestClose(), confirm(0, completedWrite)],
    finalRecords: { "report-a": { status: "done", version: 2 } },
  },
  {
    id: "unavailable_verification",
    fault: "verify_unavailable",
    steps: [requestClose(), confirm(0, { status: "unverified", commits: 1, apply: 1, verify: "verify_unavailable" })],
    finalRecords: { "report-a": { status: "done", version: 2 } },
  },
  {
    id: "holdout_batch_with_capacity_change",
    holdout: true,
    steps: [
      requestMove(),
      confirm(0, { ...blocked("precondition_changed"), read: ["review"] }, { disturb: "fill_review" }),
      reply("那换成备用箱，仍然两条一起搬，先确认新方案。", propose({
        ...batch, args: { ...batch.args, target: "backup", targetVersion: 2 },
      }, { read: ["backup"] })),
      confirm(2, completedWrite),
    ],
    finalRecords: {
      "report-a": { collectionId: "backup", version: 2 },
      "report-b": { collectionId: "backup", version: 2 },
      filler: { collectionId: "review", version: 2 },
    },
  },
];
