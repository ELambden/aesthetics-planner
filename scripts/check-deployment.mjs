import assert from "node:assert/strict";
import { readFile, readdir, stat, rm, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";

const githubPages = process.argv[2] === "github-pages";
const output = githubPages ? "dist-github" : "dist";
if (githubPages) {
  // Cloudflare route rules have no effect on a public GitHub Pages website.
  await rm(join(output, "_routes.json"), { force: true });
  await writeFile(join(output, ".nojekyll"), "");
} else {
  const routes = JSON.parse(await readFile(join(output, "_routes.json"), "utf8"));
  assert.deepEqual(routes, { version: 1, include: ["/*"], exclude: [] },
    "Every route, including map data and assets, must run authentication.");
}

const allowed = new Set(["index.html", "assets", "data", githubPages ? ".nojekyll" : "_routes.json", "robots.txt"]);
for (const name of await readdir(output)) {
  assert(allowed.has(name), "Unexpected deployment file: " + name);
}

async function checkFiles(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    assert(!entry.isSymbolicLink(), "Do not deploy symlinks: " + path);
    assert((!entry.name.startsWith(".") || (githubPages && path === join(output, ".nojekyll"))) && !/\.(?:map|pem|key|sql|ts|tsx|xls|csv)$/.test(entry.name),
      "Unexpected source or secret file: " + path);
    if (entry.isDirectory()) await checkFiles(path);
    else assert((await stat(path)).size <= 25 * 1024 * 1024, "Pages file exceeds 25 MiB: " + path);
  }
}
await checkFiles(output);

// GeoJSON layers silently disappear if the MapLibre worker is missing from a build.
const assets = await readdir(join(output, "assets"));
const workers = assets.filter((name) => /^maplibre-gl-worker-[\w-]+\.js$/.test(name));
assert.equal(workers.length, 1, "The bundled MapLibre worker must be included in the deployment.");
const worker = await readFile(join(output, "assets", workers[0]), "utf8");
assert(!worker.includes("maplibre-gl-shared.mjs"),
  "Bundle the worker's shared module using Vite's ?worker&url import.");
const scripts = await Promise.all(assets.filter((name) => name.endsWith(".js") && name !== workers[0])
  .map((name) => readFile(join(output, "assets", name), "utf8")));
assert(scripts.some((script) => script.includes(workers[0])),
  "The application must reference the emitted worker asset.");

const dataFiles = ["clinics.json", "density-overlay.geojson", "opportunity-areas.geojson"];
assert.deepEqual((await readdir(join(output, "data"))).sort(), [...dataFiles].sort(),
  "Deploy only the three prepared map datasets.");
for (const name of dataFiles) {
  const source = await readFile(join("public/data", name));
  const built = await readFile(join(output, "data", name));
  const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
  assert.equal(hash(built), hash(source), "Built data differs from local map: " + name);
  const data = JSON.parse(built);
  assert(Array.isArray(data) ? data.length > 0 : data.type === "FeatureCollection" && data.features.length > 0,
    "Map data must not be empty: " + name);
}
console.log(githubPages
  ? "GitHub Pages build checked: real map files match; no raw source datasets included. This website is public when deployed."
  : "Deployment checked: all routes protected; real map files match; no raw source datasets included.");
