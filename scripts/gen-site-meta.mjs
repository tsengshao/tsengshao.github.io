import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function run(cmd){
  return execSync(cmd, { encoding: "utf8" }).trim();
}

let lastUpdated = "";
try{
  // ISO date (YYYY-MM-DD)
  lastUpdated = run('git log -1 --format=%cs');
}catch{
  // fallback for non-git env
  lastUpdated = new Date().toISOString().slice(0,10);
}

const outDir = path.join(process.cwd(), "src", "generated");
fs.mkdirSync(outDir, { recursive: true });

const payload = {
  lastUpdated,
  commit: (() => {
    try { return run('git rev-parse --short HEAD'); } catch { return ""; }
  })(),
};

fs.writeFileSync(path.join(outDir, "site-meta.json"), JSON.stringify(payload, null, 2));
console.log("[gen-site-meta] lastUpdated =", payload.lastUpdated);
