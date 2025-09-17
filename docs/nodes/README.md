---
title: Nodes
nav_order: 6
permalink: /nodes/
---

# Nodes

Conceptual phases implemented as simple async functions:
- resolver
- agent
- tools
- toolLimitFinalize
- contextSummarize (conditional)

They live under `smart-agent/src/nodes` and are orchestrated by an internal while-loop (no external graph library).
