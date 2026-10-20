# Publishing assets to Cloudflare R2

Automated CD lives in [`.github/workflows/publish-assets.yml`](../.github/workflows/publish-assets.yml).

On each **GitHub Release**, it:

1. Packs `assets/` → `release/swiss-basemap-assets-vX.Y.Z/` (+ zip)
2. Syncs that folder to R2 at `swiss-basemap-assets/X.Y.Z/`
3. Attaches the zip to the Release

## One-time Cloudflare setup

1. Create an **R2** bucket (e.g. `swiss-basemap-assets`).
2. Create an **R2 API token** with Object Read & Write on that bucket  
   (Cloudflare dashboard → R2 → Manage R2 API Tokens).
3. Note your **Account ID** (R2 overview sidebar).
4. Attach a **custom domain** to the bucket (or use the `*.r2.dev` public URL) so apps can fetch files over HTTPS.
5. Set **CORS** on the bucket so browsers can load GeoJSON + PMTiles, including range requests:

```json
[
  {
    "AllowedOrigins": ["*"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["*"],
    "ExposeHeaders": ["ETag", "Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 86400
  }
]
```

Tighten `AllowedOrigins` to your app domains when you can.

## GitHub secrets

Repo → Settings → Secrets and variables → Actions:

| Secret | Example |
|---|---|
| `CLOUDFLARE_ACCOUNT_ID` | `a1b2c3…` |
| `R2_ACCESS_KEY_ID` | from R2 API token |
| `R2_SECRET_ACCESS_KEY` | from R2 API token |
| `R2_BUCKET_NAME` | `swiss-basemap-assets` |
| `R2_PUBLIC_BASE_URL` | `https://assets.example.com` (optional, for job summary) |

## Ship a new version

1. Bump **both** `assets/package.json` and `assets/manifest.json` `version` (e.g. `0.0.2`).
2. Commit asset changes (include updated `assets/` binaries if they changed).
3. Create a GitHub Release whose tag matches the version:
   - `v0.0.2`, or
   - `swiss-basemap-assets-v0.0.2`
4. Publishing the release runs the workflow.

Apps then point at:

```bash
VITE_SWISS_ASSETS_BASE=https://assets.example.com/swiss-basemap-assets/0.0.2
```

Versioned prefixes use long-cache headers (`immutable`). Keep old prefixes; don’t overwrite them in place.

## Manual run

Actions → **Publish assets to Cloudflare R2** → Run workflow.  
Optional checkbox syncs the same pack to `swiss-basemap-assets/latest/` (short cache; avoid for sold/pinned products).

## Local dry-run

```powershell
npm run pack:assets
# then sync with AWS CLI / rclone against your R2 endpoint if you want
```
