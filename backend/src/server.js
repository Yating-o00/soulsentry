import { app } from "./app.js";
import { env } from "./config/env.js";
import { ensureDemoUser } from "./lib/ensureDemoUser.js";

await ensureDemoUser();

app.listen(env.PORT, () => {
  console.log(`SoulSentry backend listening on http://localhost:${env.PORT}`);
});
