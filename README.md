# Anatomy for Codex

Anatomy turns technical ideas into interactive illustrations.
It helps developers and writers explain how a system works.
Physical objects and mechanisms make abstract concepts easier to follow.
The web interface lets you explore eight working examples.
Each scene is available in light and dark themes.
The gallery opens in dark mode with a minimal scene viewer.
The Codex skill helps you create illustrations for your own projects.
This is a fork of [Anatomy](https://github.com/wheresryan22/anatomy) by [Ryan](https://github.com/wheresryan22).
The fork is maintained by [Charlyhno-eng](https://github.com/Charlyhno-eng).

---

## See Anatomy for Codex in action

![An interactive rocket engine illustration](.github/assets/raptor-engine-firing.webp)

## Quickstart

### Install

Requires Node.js 22.20+ and npm.

```bash
git clone https://github.com/Charlyhno-eng/anatomy-codex.git
cd anatomy-codex
npm ci
```

### Run

```bash
npm run dev
```

Open http://localhost:5173. Choose a scene and interact with the illustration.

To install the skill in Codex:

```bash
npm run skill:install
```

Open Codex in the repository where you want to create the illustration, then start a new conversation and invoke the skill with `$anatomy`. For example:

```text
$anatomy Create a front-view anatomical illustration of a human heart.
```

Keep this Anatomy checkout in place; the installation links to it. If Codex does not detect the skill, restart Codex and try again.
