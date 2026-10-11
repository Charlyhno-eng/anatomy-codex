## What this changes



## Why



## Checks

Tick what applies, and say why for anything left unticked.

- [ ] Every example rebuilds, and `git status --short` shows only the changes I meant.
- [ ] No comments in code.
- [ ] Kit changes preserve existing geometry and interactions (or this PR says which scenes change and why).
- [ ] I built and looked at both themes.
- [ ] Figures with pipes, cables or round parts: `node dist/build.js --audit` ends `audit passed`, every failing line at 0.
- [ ] `node dist/scripts/lines.js` prints `line ends: 0` on both themes and in every resting pose.
- [ ] Shaders: a slowed contact sheet across every transition shows no pop, and `--no-webgl` still reads.
- [ ] 3D: a full run ends `turn audit passed`, and `node dist/scripts/turn-check.js` passes.
- [ ] Every number in the figure, the readout, the caption and the docs is true.

## Screenshots

Light and dark, plus 4× close-ups of every joint the change touches.
