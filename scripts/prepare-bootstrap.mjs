import { mkdir, copyFile, writeFile } from "node:fs/promises";

await mkdir(".wrangler/bootstrap", { recursive: true });
await copyFile("public/_routes.json", ".wrangler/bootstrap/_routes.json");
await writeFile(".wrangler/bootstrap/index.html",
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="robots" content="noindex"><title>Setup in progress</title><p>Private site setup is in progress.</p></html>');
console.log("Prepared an empty setup deployment. It contains no map data.");
