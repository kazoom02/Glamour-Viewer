# Glamour Viewer

A privacy-first, static browser app for previewing FFXIV glamour data from files the user controls. The application shell is deployed; game assets are not.

[![Deploy to Vercel](https://vercel.com/button)](https://vercel.com/new)

> Deploying creates an empty shell. Every user must still supply their own local game installation or a converted asset cache in a bucket they control.

## Privacy and hosting boundary

The deployed instance hosts no Square Enix data. Vercel serves only the application’s JavaScript, CSS, and separately emitted browser code. It never receives, stores, uploads, or proxies FFXIV assets.

There are exactly two asset-source modes:

1. **Local install:** Chromium uses the File System Access API to read a user-selected `game/sqpack` directory on demand. The directory handle is stored only in that browser’s IndexedDB; read permission is checked and re-requested after reload. Firefox and Safari fall back to `<input type="file" webkitdirectory>`, which reads the directory into the tab’s memory and can be very slow for a full installation.
2. **Self-hosted assets:** the user enters an `http(s)` base URL for a converted cache on infrastructure they control (for example R2 or S3). The app validates and displays the normalized URL for confirmation before making its first direct request. The bucket must expose a versioned `manifest.json`.

No server, companion process, asset proxy, credentials, or secret environment variables are part of the runtime design.

## Armor catalog

The equipment picker queries [XIVAPI v2](https://v2.xivapi.com/) directly from the browser for armor names, icons, equip slots, levels, jobs, and packed model identifiers. XIVAPI is catalog metadata only: model, material, and texture bytes still come exclusively from the selected local install or user-owned bucket.

The catalog is loaded only after an asset source is connected and makes no request until the user submits a search. `VITE_XIVAPI_BASE_URL` can override the public `https://v2.xivapi.com/api/` base URL for development; it is a public build-time setting, never a secret.

The full local random-access and decoding design is documented in [`docs/local-sqpack.md`](docs/local-sqpack.md). In short, Vercel serves the parser code, while the browser uses `File.slice()` to read only required ranges from local SqPack `.index` and `.dat*` files. No game data is sent to Vercel.

The current viewer decodes the actual base body pieces, face, hair, equipped armor, and base SKLB skeleton from `040000.win32.index2`/`datN` in module workers. It binds MDL skin weights to the shared game reference skeleton, replaces the covered `e0000` body slot when armor is equipped, and exposes drag/zoom inspection. Midlander male (`c0101`), Midlander female (`c0201`), and Roegadyn male (`c0901`) have complete standalone base parts and are selectable.

For local installs, the browser also reads the equipment IMC row selected by XIVAPI's model variant, applies its attribute visibility bits to MDL submeshes, resolves the corresponding `material/v####` MTRL files, follows their shader sampler references, and decodes TEX surfaces including BC1, BC3, BC5, and BC7. Legacy and Dawntrail color tables are baked through the material's index texture into base-color, emissive, roughness, and metalness maps; diffuse, normal, and mask inputs are combined in the worker. Decoded RGBA surfaces are cached in the material worker and in browser IndexedDB; no cache entry or game byte leaves the device.

The MTRL dye-row templates/channels are parsed, but applying a user-selected dye still requires the game stain-template (`.stm`) data and a dye picker. PAP animation sampling, PBD/EQDP deformation, and detailed equipment body-hiding metadata are also still required for animated, dye-accurate Fanbyte-level parity. Other playable races remain hidden from the selector until their shared-body deformation rules are implemented rather than being shown with an incorrect Midlander body.

## Self-hosted cache CORS

The asset origin must permit the deployed app to read it and must expose `Content-Length` so download progress can be reported:

```http
Access-Control-Allow-Origin: https://your-app.vercel.app
Access-Control-Expose-Headers: Content-Length
```

If the cache is deliberately public, `Access-Control-Allow-Origin: *` is also valid. Configure allowed methods for `GET`, `HEAD`, and `OPTIONS` when your bucket provider requires an explicit list.

For rendering, the converted cache mirrors each internal equipment path but replaces `.mdl` with `.glb`, for example `chara/equipment/e0190/model/c0201e0190_top.glb`. The manifest is metadata; model requests are direct browser-to-bucket requests.

The decoder is designed to be single-threaded. This repository intentionally has no `vercel.json`, COOP, or COEP policy. If future profiling justifies `SharedArrayBuffer` or threaded WASM, add COOP/COEP only after also requiring `Cross-Origin-Resource-Policy: cross-origin` (or equivalent CORS-compatible behavior) from every asset bucket.

## Local development

Requirements: Node.js 22 or newer and the pinned pnpm version (Corepack can activate it).

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

Production verification:

```sh
pnpm test
pnpm build
```

The Vite build writes to `dist` with `base: '/'`. The build script measures the gzipped initial JavaScript entry, warns above 250 KiB, and fails above 400 KiB. The Three.js renderer and directory parser are lazy; the parser worker uses Vite’s module-worker URL form.

## Vercel deployment

Import the repository in Vercel and accept the auto-detected Vite preset. Do not add framework, build, or output-directory overrides. The app uses hash routes such as `/#/set/<encoded>`, so it needs no SPA rewrite and no `vercel.json`.

Environment variables are not required. Any future public build-time setting must use the `VITE_` prefix. A secret in the browser bundle is not secret and should never be added.

`.vercelignore` excludes fixtures, documentation sources, extraction tooling, and test/game assets so the deployment artifact remains the web app only.
