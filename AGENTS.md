# AGENTS

Reverse engineering toolkit and workspace (`tool_revert`), powered by REA (Reverse Engineer Anything).

## Mandatory before any task

1. Read and follow `RULES.md` at the repo root: language, honesty, git, scope of changes, test quality, security. It takes precedence over this file.
2. Read `CONTEXT.md` at the repo root: stack, modules, verify commands, conventions. Use its terms and commands exactly.

## Skills

The skill set lives in `.agents/skills/` (Codex and Gemini CLI read it directly). Claude Code reads `.claude/skills/` and Antigravity reads `.agent/skills/`; both are junctions created by `.agents/link-skills.ps1`. A skill is missing → run `powershell -ExecutionPolicy Bypass -File .agents\link-skills.ps1`.

- `reverse-engineer-anything`: primary skill for decompilation, class/method analysis, APK inspection, and binary investigation.

Agents without skill support: still follow `RULES.md` and the rules below.

## Definition of DONE

Work is done only when the verify script (Commands section of `CONTEXT.md`) exits with code 0:
`powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1` (or `./scripts/verify.sh`)

## Project rules (in addition to `RULES.md`)

- All reverse engineering actions should operate within output directories (`output/`) or read targets as read-only.
- Preserve Evidence IDs and findings when querying REA engines.
- Write tests in `test/` for any new utility, analyzer, or reporter logic.
