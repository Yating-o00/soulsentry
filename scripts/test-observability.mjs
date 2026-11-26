import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
function tests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (["node_modules", "dist", ".git"].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? tests(file) : /\.test\.(?:js|mjs)$/.test(file) ? [file] : [];
  });
}
const files = ["backend/src", "backend/scripts/harness-eval", "scripts", "src/lib"]
  .flatMap(directory => tests(path.join(root, directory))).sort();
const result = spawnSync(process.execPath, ["--test", ...files], { cwd: root, stdio: "inherit" });
process.exit(result.status ?? 1);
