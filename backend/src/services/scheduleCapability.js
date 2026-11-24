import { z } from "zod";
import { defineCapability, invokeCapability } from "./agentHarness/capability.js";
import { ownedMemoryProposal } from "./memoryStore.js";
import { loadPlanningBusy, validateScheduledSessions } from "./taskHarness.js";

const hasActor = (_args, { actorId }) => typeof actorId === "string" && actorId.length > 0;

const scheduleCheck = defineCapability({
  name: "schedule_check",
  description: "Check the scheduling constraints and occupied time windows for a proposal.",
  effect: "read",
  input: z.object({ plan: z.unknown(), constraints: z.record(z.unknown()).nullish(), refreshBusy: z.boolean().optional() }),
  authorize: hasActor,
  async execute({ plan, constraints, refreshBusy }, { actorId, db }) {
    const { busy: observedBusy, ...snapshot } = constraints ?? {};
    const busy = refreshBusy || observedBusy == null ? await loadPlanningBusy(db, actorId, snapshot) : observedBusy;
    return { snapshot, errors: validateScheduledSessions(plan, { ...snapshot, busy }) };
  },
});

export function checkSchedule(args, context) {
  return invokeCapability(scheduleCheck, args, context);
}

const scheduleConfirm = defineCapability({
  name: "schedule_confirm",
  description: "Apply a stored, user-confirmed scheduling proposal through the plan transaction.",
  effect: "write",
  input: z.object({ proposalId: z.string() }),
  authorize: hasActor,
  async execute({ proposalId }, { actorId, db, savePlan }) {
    const proposal = await ownedMemoryProposal(db, actorId, proposalId);
    const draft = proposal?.meta.planDraft;
    if (!draft) return null;

    const { parent: plannedParent, children: plannedChildren } = draft.extracted.plan;
    const { title, description, category = "personal", priority = "medium" } = plannedParent;
    const parent = { title, description, category, priority, status: "pending" };
    const children = plannedChildren.map((child) => ({
      title: child.title, description: child.description, category, priority, status: "pending",
      reminder_time: `${child.date}T${child.start_time}:00+08:00`,
      end_time: `${child.date}T${child.end_time}:00+08:00`,
      plan_kind: child.kind, plan_group: child.plan_group, session_type: child.session_type,
      note: child.note ?? undefined, tags: ["智能规划"],
    }));
    return savePlan({ proposalKey: `companion:${proposal.id}`, parent, children, memoryProposalId: proposal.id, draft });
  },
});

export function confirmSchedule(proposalId, context) {
  if (!proposalId) return null;
  return invokeCapability(scheduleConfirm, { proposalId }, context);
}
