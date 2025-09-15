# Monorepo layout: smart-agent + examples

This repository is organized for a single NPM package publish from the `smart-agent/` folder and a rich examples collection in `examples/`.

- smart-agent/: the NPM package. Publish by running npm publish from inside this folder.
- examples/: runnable examples, each with its own README.

Local development
- From repo root: cd smart-agent && npm install && npm run build
- Link locally to run examples against local build: from smart-agent/: npm link; from repo root: npm link @cognipeer/smart-agent
- Then run examples with tsx, e.g., OPENAI_API_KEY=... npx tsx examples/tools/tools.ts

Publishing to NPM
- Only publish the smart-agent/ folder: cd smart-agent && npm publish --access public
- Ensure version bump in smart-agent/package.json and that dist/ is built.

