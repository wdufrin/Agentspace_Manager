---
name: adk-cheatsheet
description: >
  MUST READ before writing or modifying any ADK agent code.
  ADK API quick reference for Python. Covers agent types, tool definitions,
  orchestration patterns, callbacks, state management, and common pitfalls.
  Use when user asks "how do I define an agent", "create a tool",
  "what orchestration patterns exist", "how do callbacks work",
  or when writing Agent(), FunctionTool, callbacks, or orchestration code.
  Do NOT use for deployment, evaluation, or project scaffolding questions.
metadata:
  author: Google
  version: 0.1.0
  mcp-server: adk-mcp
---

# ADK Cheatsheet

Check the project's GEMINI.md (or CLAUDE.md / AGENTS.md) for the language
being used, then read the matching file in this skill directory:

- Python → `references/python.md`

# Troubleshooting

Error: `ImportError: cannot import name 'load_web_page' from 'google.adk.tools'`
Cause: Importing the module instead of the tool instance
Solution: Use `from google.adk.tools.load_web_page import load_web_page` (not `from google.adk.tools import load_web_page`)

Error: `output_schema` disables all tools
Cause: Setting `output_schema` on an agent prevents it from calling any tools
Solution: Remove `output_schema` if the agent needs to call tools, or use a two-agent pattern where one calls tools and another formats output

Error: Sub-agent not executing
Cause: Passing a function reference instead of an agent instance to `sub_agents`
Solution: Pass agent instances: `sub_agents=[my_agent]` not `sub_agents=[create_agent]`
