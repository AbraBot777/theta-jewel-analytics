import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dist = path.join(appRoot, "dist");

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, "data"), { recursive: true });
fs.mkdirSync(path.join(dist, "server"), { recursive: true });
fs.mkdirSync(path.join(dist, ".openai"), { recursive: true });

fs.copyFileSync(path.join(appRoot, "public", "data", "dashboard.json"), path.join(dist, "data", "dashboard.json"));
fs.copyFileSync(path.join(appRoot, "app", "globals.css"), path.join(dist, "styles.css"));
fs.copyFileSync(path.join(appRoot, "static", "app.js"), path.join(dist, "app.js"));
fs.copyFileSync(path.join(appRoot, "static", "index.html"), path.join(dist, "index.html"));
fs.copyFileSync(path.join(appRoot, ".openai", "hosting.json"), path.join(dist, ".openai", "hosting.json"));
fs.writeFileSync(path.join(dist, ".nojekyll"), "");

const files = {
  "/": {
    contentType: "text/html; charset=utf-8",
    body: fs.readFileSync(path.join(dist, "index.html"), "utf8")
  },
  "/index.html": {
    contentType: "text/html; charset=utf-8",
    body: fs.readFileSync(path.join(dist, "index.html"), "utf8")
  },
  "/styles.css": {
    contentType: "text/css; charset=utf-8",
    body: fs.readFileSync(path.join(dist, "styles.css"), "utf8")
  },
  "/app.js": {
    contentType: "text/javascript; charset=utf-8",
    body: fs.readFileSync(path.join(dist, "app.js"), "utf8")
  },
  "/data/dashboard.json": {
    contentType: "application/json; charset=utf-8",
    body: fs.readFileSync(path.join(dist, "data", "dashboard.json"), "utf8")
  }
};

const worker = `const files = ${JSON.stringify(files)};

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const route = files[url.pathname] || files[url.pathname.replace(/\\/$/, "")] || files["/"];
    return new Response(route.body, {
      headers: {
        "content-type": route.contentType,
        "cache-control": url.pathname === "/data/dashboard.json" ? "no-store" : "public, max-age=300"
      }
    });
  }
};
`;

fs.writeFileSync(path.join(dist, "server", "index.js"), worker);

console.log("Built static dist/ site.");
