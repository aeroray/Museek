# Gemini Agent Guidance

Use the MemoryCustodian project memory under `docs/memory/`.

Before substantial work:

1. Read `docs/memory/manifest.md`; it is the sole routing authority.
2. Read `docs/memory/brief.md`.
3. Load only task-specific files allowed by the manifest.
4. Do not load `inbox.md` or `archive/` unless asked or maintaining memory.

Keep this entry point short. Do not import `docs/memory/` files from this file; load them through Gemini context when required.
