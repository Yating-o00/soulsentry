import { createBulkMovePilotDriver } from "./bulk-move-pilot.js";
import { generalCases } from "./general-cases.js";
import { runLiveGeneralCases } from "./live-general.js";

await runLiveGeneralCases(generalCases.filter(({ holdout }) => holdout), createBulkMovePilotDriver);
