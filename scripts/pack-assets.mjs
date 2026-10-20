#!/usr/bin/env node
/**
 * Build a versioned release folder (+ zip) for swiss-basemap-assets.
 *
 *   node scripts/pack-assets.mjs
 *
 * Output: release/swiss-basemap-assets-vX.Y.Z[/].zip
 */
import { cp, mkdir, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const assetsDir = path.join(root, "assets");

const pkg = JSON.parse(await readFile(path.join(assetsDir, "package.json"), "utf8"));
const version = pkg.version;
const tag = `swiss-basemap-assets-v${version}`;
const outDir = path.join(root, "release", tag);

async function exists(p) {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const copyList = [
  "package.json",
  "manifest.json",
  "README.md",
  "DATA_NOTICES.md",
  "tiles/hillshade.pmtiles",
  "data/base/switzerland_boundary.geojson",
  "data/base/settlements.geojson",
  "data/base/lakes.geojson",
  "data/base/rivers.geojson",
];

for (const rel of copyList) {
  const src = path.join(assetsDir, rel);
  if (!(await exists(src))) {
    throw new Error(`Missing asset: ${rel}`);
  }
  const dest = path.join(outDir, rel);
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest);
}

const zipPath = `${outDir}.zip`;
await rm(zipPath, { force: true });

const isWin = process.platform === "win32";
if (isWin) {
  execFileSync(
    "powershell.exe",
    ["-NoProfile", "-Command", `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zipPath}' -Force`],
    { stdio: "inherit" },
  );
} else {
  execFileSync("zip", ["-r", zipPath, "."], { cwd: outDir, stdio: "inherit" });
}

const sizeMb = ((await stat(zipPath)).size / (1024 * 1024)).toFixed(1);
console.log(`Packed ${tag}`);
console.log(`  folder: ${outDir}`);
console.log(`  zip:    ${zipPath} (${sizeMb} MB)`);
