# Local SqPack browser pipeline

The Vercel deployment never reads or receives SqPack data. Vercel serves the static JavaScript/CSS/WASM application, and that application asks the browser for local read permission after it has loaded.

```text
Vercel CDN ── app code ──> browser
                              │
                              │ File System Access API (read only)
                              ▼
                    user's game/sqpack folder
                              │
                              │ ArrayBuffer ranges
                              ▼
                    worker parser → Three.js
```

There is no upload arrow from the browser to Vercel.

## Directory selection

The user selects the directory ending in `game/sqpack`, not the game root. A normal selection contains repository directories such as:

```text
sqpack/
  ffxiv/
    040000.win32.index2
    040000.win32.dat0
    040000.win32.dat1
    ...
  ex1/
  ex2/
  ex3/
  ex4/
  ex5/
```

The `04` category is `chara`, containing equipment, character, monster, material, and texture files. The application validates the character index and first data archive before accepting the directory. It stores only the `FileSystemDirectoryHandle` in IndexedDB and checks/re-requests read permission after a reload.

On browsers without `showDirectoryPicker`, `webkitdirectory` supplies a `FileList`. Those `File` objects must be retained for the current tab and indexed by `webkitRelativePath`; they cannot be restored after a reload.

## From an XIVAPI item to a game path

For wearable armor, XIVAPI's packed `ModelMain` value contains the equipment set in the low 16 bits and material variant in the next 16 bits. For example, `65726` is equipment set `190`, variant `1`.

For a Midlander female body item, the initial paths are:

```text
chara/equipment/e0190/model/c0201e0190_top.mdl
chara/equipment/e0190/e0190.imc
chara/equipment/e0190/material/v0001/
```

Slot suffixes used by equipment models:

| Slot | Suffix |
| --- | --- |
| Head | `met` |
| Body | `top` |
| Hands | `glv` |
| Legs | `dwn` |
| Feet | `sho` |

Not every equipment set contains a model for every race code. Production resolution needs the game's race fallback/deformation rules rather than assuming the requested path always exists.

## Random-access reader

Do not load multi-gigabyte `.dat` archives into memory. The reader should:

1. Open `040000.win32.index2` (or `.index`) from the selected repository.
2. Parse its SqPack header and hash table.
3. Normalize the requested internal path and compute its SqPack path hash.
4. Find the encoded data-file ID and byte offset.
5. Open only the referenced `040000.win32.datN` file.
6. Read the entry header and compressed block table with `File.slice(offset, end).arrayBuffer()`.
7. Inflate only the blocks belonging to the requested resource.

`src/asset-source/localSqpack.ts` already provides directory validation, file opening, and bounded range reads. Index parsing and block decompression should live in the existing module worker so the UI thread remains responsive.

## Decode graph for one armor piece

After extracting the relevant virtual files:

1. Parse `.imc` to select the correct material/mesh variant and visible parts.
2. Parse the race-specific `.mdl` into positions, normals, tangents, UVs, indices, bone indices, and bone weights.
3. Resolve every material path referenced by the model.
4. Parse each `.mtrl` colorset and its referenced `.tex` files.
5. Decode texture formats to `ImageBitmap` or GPU-ready buffers.
6. Load the base character skeleton and bind equipment skinning weights to it.
7. Apply EQP/EQDP visibility and deformation rules so covered body pieces are hidden correctly.
8. Construct `THREE.BufferGeometry`, materials, textures, and skinned meshes in memory.

The browser does not need to generate GLB for local mode. It can construct Three.js objects directly. The self-hosted cache converter should emit GLB/KTX2 because those are efficient transport formats for a bucket.

## Implementation strategy

Ironworks is the best reference for the binary structures because it already covers SqPack, MDL, MTRL, TEX, SKLB, PBD, and EQDP. Two viable approaches are:

- Port only the required structures to TypeScript, using `DataView` and typed arrays.
- Compile a narrow Rust decoder to single-threaded WASM and expose functions that accept individual extracted file buffers.

Keep filesystem traversal and range reads in TypeScript because the File System Access API is asynchronous. Pass the small extracted buffers—not directory handles or whole archives—into WASM.

Start with `c0201` (Midlander female), one body item, variant 1, and no dye. Add IMC part masks, additional slots, race fallbacks, skeleton deformation, and dyes after that single path renders correctly.

## Vercel behavior

File System Access requires a secure context; a normal `https://*.vercel.app` deployment qualifies. It does not require a Vercel function, rewrite, environment secret, upload endpoint, or CORS configuration.

The only cross-origin calls in local mode are optional XIVAPI catalog requests and icons. SqPack access is local browser I/O, not HTTP.
