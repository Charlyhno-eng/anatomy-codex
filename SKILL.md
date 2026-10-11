---
name: anatomy
description: Build detailed interactive isometric SVG figures that explain technical ideas through physical objects and mechanisms. Use for technical illustrations, interactive explainers and explanatory figures for documentation or articles, with optional WebGL effects or moving 3D parts. Supports standalone HTML and React/Next.js in TypeScript.
---

# Anatomy for Codex

Explain the concept through the mechanism of a believable object: an instrument, machine, tool or piece of furniture. A cache key can become a pin-tumbler lock; a shared GPU can become a plotter whose head visits many wells. The model that moves the object must also drive its readout and caption.

## Locate and prepare the kit

Resolve this skill's directory from the installed `SKILL.md` path. Relative paths in this guide refer to that directory, which may differ from the user's working directory. Run repository commands there; write the user's deliverables in their requested project.

Sources are TypeScript (`.ts` / `.tsx`). ESM source imports deliberately use `.js` extensions, which TypeScript resolves to `.ts` and preserves for Node. Compiled JavaScript and previews live in `dist/`. Never embed raw TypeScript in HTML or maintain another JavaScript copy of a source module.

If `node_modules/` or `dist/` is absent, use Node 22.20+ and run:

```sh
npm ci
npm run build
```

`npm run build` compiles the kit, scripts and examples, prepares the committed standalone previews, and bundles both React examples. Use `npm run build:examples -- dial-indicator` to regenerate a standalone example; omit the name to regenerate all six. Dense examples may take several minutes. `npm run dev` builds and serves the gallery at http://localhost:5173. The gallery uses a minimal dark interface and opens scenes in dark mode by default.

This skill uses Codex's normal shell and image inspection capabilities. It needs no model SDK, API key, hook, MCP server or external agent CLI. Chrome/Chromium is needed only for browser captures and checks; set `CHROME_PATH` if discovery fails. Respect the user's scope and the environment's execution permissions.

## Choose a reference

Open the closest example and read only the guides needed for the requested mode:

| Example | Useful techniques |
|---|---|
| `examples/dial-indicator/` | Small standalone SVG instrument, carriage, needle, pointer and keyboard |
| `examples/desk-computer/` | Keyboard, CRT in a face plane, power transitions, live text |
| `examples/arcade-cabinet/` | Cutaway, shared build/live geometry, coin mechanism, routed cables, screen simulation |
| `examples/raptor-engine/` | Dense round parts, pipework, exploded assemblies, staggered springs, WebGL plume |
| `examples/ripple-tank/` | Pure dispersion/optics model, two WebGL layers, history textures |
| `examples/test-rig/` | React spring carriage and gauge, pure model, static art/client motion split |
| `examples/spot-plate/` | React morphing shapes, shared distance field, one control driving many parts |
| `examples/turning-dial/` | Optional 3D groups, hinges, free bodies, materials; `stress.ts` measures dense scenes |

Read [references/craft.md](references/craft.md) for the visual vocabulary and [references/kit.md](references/kit.md) for signatures. Use [references/motion.md](references/motion.md) for interaction, [references/react.md](references/react.md) for React, [references/webgl.md](references/webgl.md) before shaders, and [references/3d.md](references/3d.md) before moving parts in depth. [references/walkthrough.md](references/walkthrough.md) explains the test rig's design.

## Build the explanation

1. Establish the real sizes, counts, thresholds and behaviour. Put them in a pure typed model where practical. Avoid numbers invented to make the picture look busy.
2. Choose an object whose mechanism maps onto the idea. Describe what moves and what it means. Agree on scope only when missing information materially affects the result; build a working preview early.
3. Plan the base, structure, mechanism, controls and subject. Richness comes from useful small parts: feet, screws, grooves, rails, collars, springs, ticks and knurls. The test rig is the drawing reference; the Raptor is the shader reference.
4. Lay out world coordinates with z up. The default camera is azimuth 45°, elevation 30°; adjust for visibility and fit with `fitProjection`.
5. Compute static geometry once. Use `kit/iso-kit.ts` for slabs, cylinders, extrusions, paths, dots, cards and pages; `kit/lathe.ts` for curved bodies on any axis; `kit/tube.ts` for pipes and cables. Move rigid parts with transforms; rebuild only changing shapes.
6. Paint in physical depth order. Split wrapping parts into front/back sections. Record the true geometry with `kit/audit.ts`, use `settle` to solve keys, and use `auditOrExit` when the figure contains pipes, cables or round parts. Repair intersections in geometry.
7. Frame the figure with a number, short title, interaction hint, live readout, legend and true caption. Support pointer and keyboard, pause offscreen, and provide a still state under reduced motion.

## Rendering paths

**Standalone HTML / SVG:** Write a TypeScript build module using `solidSvg`, `lineSvg`, `dotsSvg`, `wireSvg`, `faceTextSvg`, `figureSvg`, `plateHtml` and `pageHtml`. Use `scripts/inline-kit.ts` (`kitScript`, `glScript`, `turnScript`, `browserScript`) to embed compiled JavaScript without ESM markers. Keep browser behaviour in `live.ts`, compile it, then inject serialized model data. The example builders show this contract. Compile new modules in their own project or add them to this repository's `tsconfig.json` include patterns before running `npm run build`.

**React / Next.js:** Keep geometry and model modules in `.ts`; use `kit/react/draw.tsx` for static art, and `kit/react/live.tsx` in the client component. Pass static art as element props and update refs instead of rendering React every frame. Import `kit/iso.css` once. The bundled React previews show browser behaviour; they do not replace a host application's Next.js configuration.

**WebGL:** Effects live in world space using the same camera as the SVG. Use back SVG, effect canvas and front SVG; mask openings in both planes. Uniforms follow smooth envelopes. Every effect reaches zero before its spatial limits. Design light theme as ink on paper, use reduced motion and a readable SVG fallback.

**3D:** `turn-build.ts` authors groups and parts, `turn.ts` re-projects and shades them, and `turn-audit.ts` checks angle/pose coverage. Keep contacts flush or tangent and routes clear throughout motion. The mode remains beta; the dense stress scene has significant CPU cost. `turn-fixed.ts`, `canvas-painter.ts` and `gl-shared.ts` are experimental alternatives.

For the original detailed object vocabulary, sizing guidance, layer budgets and complete review criteria, read [references/design.md](references/design.md).

## Craft constraints

- Use filled solids with real thickness and occlusion. Tone hierarchy: base `lo`, structure `mid`, subject `hi`, one focal accent `lit`.
- Detail belongs to the mechanism. Texture ends on an edge or fades; lines resolve on a stroke, outline or terminal dot. Intentionally free ends must be marked.
- Pipes/cables have real ports and clearance, including exploded and intermediate poses. Gap tubes under collars and clamps; prove overlapping items' order.
- Curved parts shade smoothly. Use smooth knots, analytic profiles, `bandsOf`, `sphereOf`, faded ribs and shared surfaces instead of tone staircases.
- Screens and text fit and clip to their windows. Keep prose outside the drawing apart from a small engraved label.
- Ship light and dark themes. Check the figure at desktop and 390 px width, at normal scale and enlarged junctions.

## Verification and delivery

When verification is part of the task, follow [references/verify.md](references/verify.md). Run commands from the skill root after compilation:

```sh
npm run typecheck
node dist/examples/dial-indicator/build.js --light
node dist/scripts/capture.js dist/examples/dial-indicator/dial-indicator-light.html --out shots/desktop.png
node dist/scripts/capture.js dist/examples/dial-indicator/dial-indicator-light.html --out shots/phone.png --width 390
node dist/scripts/lines.js dist/examples/dial-indicator/dial-indicator-light.html --out shots/lines.png
```

Use `drive.js` for interaction sequences, apart poses, slow contact sheets and `--no-webgl`. Geometry checks run with a builder's `--audit`; 3D checks use `turn-check.js` and `turn-audit.ts`. Read every screenshot you rely on, using the available image viewer. Do not claim an audit, visual check or browser interaction passed unless it actually ran. Report exact deliverable paths, commands, and any check blocked by the environment. The JSON in `evals/evals.json` contains manual skill evaluation scenarios, not an executable test suite.
