#!/usr/bin/env node
/**
 * Scaffold a new Swiss GIS app as a sibling of this repo, wired to the CDN assets.
 *
 * Usage:
 *   node scripts/new-project.mjs <project-name> [--cdn <base-url>] [--install]
 *
 * Examples:
 *   npm run new-project -- swiss-flood-viewer
 *   npm run new-project -- swiss-flood-viewer --cdn https://assets.example.com/swiss-basemap-assets/0.0.1
 *   npm run new-project -- swiss-flood-viewer --install
 *
 * Creates: ../<project-name>/  (same parent folder as swiss-basemap)
 * Copies map code only — heavy tiles/geojson stay on the CDN.
 */
import { cp, mkdir, readFile, writeFile, access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const parent = path.dirname(root);

function usage(exitCode = 1) {
  console.log(`Usage: node scripts/new-project.mjs <project-name> [options]

Options:
  --cdn <url>   CDN base for swiss-basemap-assets (no trailing slash)
  --install     Run npm install in the new project
  --force       Allow using a non-empty destination directory
  -h, --help    Show help

Env:
  SWISS_ASSETS_CDN   Default CDN base if --cdn is omitted
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { name: null, cdn: process.env.SWISS_ASSETS_CDN || "", install: false, force: false };
  const positional = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage(0);
    if (a === "--install") {
      args.install = true;
      continue;
    }
    if (a === "--force") {
      args.force = true;
      continue;
    }
    if (a === "--cdn") {
      args.cdn = argv[++i] || "";
      continue;
    }
    if (a.startsWith("-")) {
      console.error(`Unknown option: ${a}`);
      usage(1);
    }
    positional.push(a);
  }
  args.name = positional[0] || null;
  return args;
}

function slugOk(name) {
  return /^[a-zA-Z][a-zA-Z0-9._-]*$/.test(name);
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyFile(src, dest) {
  await mkdir(path.dirname(dest), { recursive: true });
  await cp(src, dest);
}

const args = parseArgs(process.argv.slice(2));
if (!args.name) usage(1);
if (!slugOk(args.name)) {
  console.error(`Invalid project name '${args.name}'. Use letters/numbers/._- starting with a letter.`);
  process.exit(1);
}

const assetsPkg = JSON.parse(await readFile(path.join(root, "assets", "package.json"), "utf8"));
const version = assetsPkg.version;
const defaultCdn = `https://assets.example.com/swiss-basemap-assets/${version}`;
const cdnBase = (args.cdn || defaultCdn).replace(/\/$/, "");

const dest = path.join(parent, args.name);
if (await exists(dest)) {
  const { readdir } = await import("node:fs/promises");
  const entries = await readdir(dest);
  if (entries.length && !args.force) {
    console.error(`Destination already exists and is not empty: ${dest}`);
    console.error("Pass --force to write into it anyway.");
    process.exit(1);
  }
}

await mkdir(dest, { recursive: true });
await mkdir(path.join(dest, "public"), { recursive: true });
await mkdir(path.join(dest, "src", "map"), { recursive: true });
await mkdir(path.join(dest, "src", "lib"), { recursive: true });

const copyList = [
  ["src/map/SwissMap.tsx", "src/map/SwissMap.tsx"],
  ["src/map/referenceLayers.ts", "src/map/referenceLayers.ts"],
  ["src/map/layerStyle.ts", "src/map/layerStyle.ts"],
  ["src/map/pmtiles.ts", "src/map/pmtiles.ts"],
  ["src/map/basemap.ts", "src/map/basemap.ts"],
  ["src/lib/geojsonFix.ts", "src/lib/geojsonFix.ts"],
  ["src/config.ts", "src/config.ts"],
  ["src/styles.css", "src/styles.css"],
  ["src/main.tsx", "src/main.tsx"],
  ["src/App.tsx", "src/App.tsx"],
  ["src/vite-env.d.ts", "src/vite-env.d.ts"],
  ["tsconfig.json", "tsconfig.json"],
];

for (const [relSrc, relDest] of copyList) {
  await copyFile(path.join(root, relSrc), path.join(dest, relDest));
}

const title = args.name
  .split(/[-_]/)
  .filter(Boolean)
  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
  .join(" ");

await writeFile(
  path.join(dest, "index.html"),
  `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${title}</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@500;600;700&family=Inter:wght@400;500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
  "utf8",
);

await writeFile(
  path.join(dest, "vite.config.ts"),
  `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: false,
  },
  build: {
    target: "es2022",
  },
});
`,
  "utf8",
);

await writeFile(
  path.join(dest, "package.json"),
  JSON.stringify(
    {
      name: args.name,
      private: true,
      version: "0.0.1",
      type: "module",
      description: `Swiss GIS app using swiss-basemap-assets@${version} from CDN.`,
      scripts: {
        dev: "vite",
        build: "tsc --noEmit && vite build",
        preview: "vite preview",
      },
      dependencies: {
        "maplibre-gl": "^4.7.1",
        pmtiles: "^4.5.0",
        react: "^18.3.1",
        "react-dom": "^18.3.1",
      },
      devDependencies: {
        "@types/geojson": "^7946.0.14",
        "@types/react": "^18.3.12",
        "@types/react-dom": "^18.3.1",
        "@vitejs/plugin-react": "^4.3.4",
        typescript: "~5.6.3",
        vite: "^5.4.11",
      },
    },
    null,
    2,
  ) + "\n",
  "utf8",
);

await writeFile(
  path.join(dest, ".gitignore"),
  `node_modules/
dist/
*.log
.env.local
.DS_Store
`,
  "utf8",
);

await writeFile(
  path.join(dest, ".env"),
  `# swiss-basemap-assets CDN (no trailing slash)
VITE_SWISS_ASSETS_BASE=${cdnBase}
`,
  "utf8",
);

await writeFile(
  path.join(dest, ".env.example"),
  `VITE_SWISS_ASSETS_BASE=https://assets.example.com/swiss-basemap-assets/${version}
`,
  "utf8",
);

await writeFile(
  path.join(dest, "public/.gitkeep"),
  "",
  "utf8",
);

await writeFile(
  path.join(dest, "README.md"),
  `# ${title}

Scaffolded from [swiss-basemap](../swiss-basemap). Map code is local; **basemap data is loaded from the CDN** (\`swiss-basemap-assets@${version}\`).

## Setup

\`\`\`powershell
npm install
npm run dev
\`\`\`

CDN base (edit \`.env\`):

\`\`\`
VITE_SWISS_ASSETS_BASE=${cdnBase}
\`\`\`

That URL must serve:

- \`/tiles/hillshade.pmtiles\` (HTTP range requests)
- \`/data/base/lakes.geojson\`
- \`/data/base/rivers.geojson\`
- \`/data/base/switzerland_boundary.geojson\`
- \`/data/base/settlements.geojson\`

## Project layout

\`\`\`text
src/
  map/           # SwissMap + reference layers (from swiss-basemap)
  config.ts      # reads VITE_SWISS_ASSETS_BASE
  App.tsx        # starter UI — replace with your product
public/          # your app-only static files (not the basemap pack)
\`\`\`

Add deck.gl / analysis layers on top of \`<SwissMap />\` without vendoring the ~80 MB hillshade.
`,
  "utf8",
);

// Tweak App title to project name
const appPath = path.join(dest, "src", "App.tsx");
let appSrc = await readFile(appPath, "utf8");
appSrc = appSrc.replace(
  `<h1 className="layer-panel__title">Switzerland</h1>`,
  `<h1 className="layer-panel__title">${title}</h1>`,
);
await writeFile(appPath, appSrc, "utf8");

if (args.install) {
  console.log("Running npm install …");
  execFileSync("npm", ["install"], { cwd: dest, stdio: "inherit", shell: true });
}

const usingPlaceholder = !args.cdn && !process.env.SWISS_ASSETS_CDN;
console.log(`Created ${dest}`);
console.log(`  CDN: ${cdnBase}`);
if (usingPlaceholder) {
  console.log("  (placeholder CDN — pass --cdn or set SWISS_ASSETS_CDN)");
}
console.log(`
Next:
  cd ${dest}
  ${args.install ? "" : "npm install\n  "}npm run dev
`);
