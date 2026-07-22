import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(appRoot, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "data"), { recursive: true });

fs.copyFileSync(path.join(appRoot, "public", "data", "dashboard.json"), path.join(dist, "data", "dashboard.json"));
fs.copyFileSync(path.join(appRoot, "app", "globals.css"), path.join(dist, "styles.css"));
fs.copyFileSync(path.join(appRoot, "static", "app.js"), path.join(dist, "app.js"));
fs.copyFileSync(path.join(appRoot, "static", "index.html"), path.join(dist, "index.html"));

console.log("Built static dist/ site.");
