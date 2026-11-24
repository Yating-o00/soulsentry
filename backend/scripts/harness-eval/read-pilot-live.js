import { generalCases } from "./general-cases.js";
import { runLiveGeneralCases } from "./live-general.js";
import { createReadPilotDriver } from "./read-pilot.js";

const scenarios = ["choose_grounded_read", "soft_preference_no_extra_turn", "clarify_and_resume"].map((id) => {
  const { steps } = generalCases.find((item) => item.id === id);
  return { id: id === "clarify_and_resume" ? `${id}:first_turn` : id, steps: [steps[0]] };
});
await runLiveGeneralCases(scenarios, createReadPilotDriver);
