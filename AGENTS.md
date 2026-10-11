# Anatomy for Codex

This repository is a Codex skill and a TypeScript drawing kit. Read `README.md` for setup. `SKILL.md` applies when creating an explanatory figure, not to unrelated repository maintenance.

- Maintain executable sources in `.ts` and `.tsx`. Use `.js` extensions for relative ESM imports; TypeScript emits those modules into `dist/`.
- `kit/iso-kit.ts` is the sole source of the core. Do not restore a hand-maintained JavaScript duplicate.
- `npm ci` installs dependencies, `npm run typecheck` checks sources, and `npm run build` creates `dist/`, browser bundles and the gallery. `npm run build:examples` regenerates standalone scenes after compilation.
- Browser behaviour belongs in `live.ts`. Read compiled browser code through `browserScript`, which removes ESM markers and source map comments before embedding it in HTML.
- Generated outputs belong in `dist/`; screenshots in `shots/`. The HTML under `examples/` is reference output and must only be updated intentionally.
- Keep geometric models, DOM interactions, shader layers, light/dark themes, keyboard operation and reduced motion intact. Add concrete types when changing dynamic scene records; do not suppress file checking.
- Skill installation uses `.agents/skills/anatomy` and invocation uses `$anatomy`. Resolve resources relative to the installed skill root, and deliver generated figures in the user's requested workspace.
- Do not add model API calls, an external agent runtime or an MCP dependency to the drawing kit.
- Keep all repository prose, source comments, interface text and documentation in English.
- The web interface runs on port 5173. GIF export captures the current tab with Region Capture and encodes locally with FFmpeg. Preserve the size ceiling, cancellation and capture cleanup; never silently return an oversized file.
