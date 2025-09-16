---
title: Debugging & Logs
nav_order: 10
permalink: /debugging/
---

# Debugging and Logs

When `debug.enabled: true`, each invoke writes Markdown files under `logs/<timestamp>/`. Contents include model name, date, limits, usage, tool definitions, and the full message timeline.

Optionally, provide a `callback` to intercept log entries in memory instead of writing to disk.
