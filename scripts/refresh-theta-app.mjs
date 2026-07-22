import { spawnSync } from "node:child_process";
import path from "node:path";

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const workspaceRoot = path.resolve(appRoot, "..");
const thetaRoot = path.join(workspaceRoot, "trading-system-theta-gann");

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: process.env
  });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed with exit ${result.status}`);
  }
}

run("python3", ["scripts/theta-wins-only-cycle.py"], thetaRoot);
run("node", ["scripts/build-dashboard-data.mjs"], appRoot);

console.log("Theta Jewel Analytics data refresh complete.");
