# Agent setup for this project

Everything is project-scoped. Nothing lives in the user's home directory.

| Path | Purpose |
| --- | --- |
| `RULES.md` | General rules for every agent (language, honesty, git, scope, tests, security). Highest priority after the user. |
| `AGENTS.md` | Read automatically by Codex, Antigravity, Cursor, Copilot. Points to `RULES.md` + `CONTEXT.md`; skills, change tracking, DONE. |
| `CLAUDE.md` | Read automatically by Claude Code. Imports `RULES.md`, `AGENTS.md`, `CONTEXT.md`. |
| `CONTEXT.md` | Project context: stack, commands, conventions, domain glossary. |
| `.agents/skills/` | Skill source (13 skills). Codex and Gemini CLI read it directly. |
| `.agents/link-skills.ps1` | Creates junctions `.claude/skills/<skill>` (Claude Code) and `.agent/skills/<skill>` (Antigravity). |
| `scripts/verify.ps1`, `scripts/verify.sh` | One verification command. |

Precedence: the user in the current session > `RULES.md` > `AGENTS.md`/`CONTEXT.md` > skills.

## Setup on a machine

Run once after cloning or moving the repo, and after adding/removing/renaming a skill:

```powershell
powershell -ExecutionPolicy Bypass -File .agents\link-skills.ps1
```

Then restart the agents. Edit skills only in `.agents/skills/`.

## Ship a feature

Invoke `ship-feature <request description>` (Claude: `/ship-feature`; Codex: `$ship-feature`). Pipeline:

```text
android-grill ──► GATE 1 (confirm requirements)
android-plan → android-spec → android-test-design ──► GATE 2 (approve plan + spec + test cases)
android-tickets
  └─ per ticket: android-tdd → android-self-test (quick)   [android-diagnose on failure, ≤ 3 rounds]
android-self-test (full) → android-review (self-fix 🔴🟡)
android-deliver ──► GATE 3 (acceptance)
```

Artifacts: `docs/features/<slug>/` (requirements, plan, spec, test-matrix, tickets, progress, changed-files.txt,
self-test-report, delivery-report). Backups before editing a file: `.agent-backup/<slug>/`.
Invoke `ship-feature` again with the same request to resume from `progress.md`.

## Standalone use

| Skill | When |
| --- | --- |
| `android-context-setup` | Refresh `CONTEXT.md`, `AGENTS.md`, `CLAUDE.md`, verify scripts (user-invoked only) |
| `android-grill` | Requirements are vague |
| `android-plan` | Plan only, no code yet |
| `android-spec` / `android-test-design` | Write acceptance criteria / design test cases |
| `android-tdd` | Any feature, bug fix, or test work (the agent invokes it on its own) |
| `android-diagnose` | Build/test failures, crashes, hard bugs |
| `android-review` | Review a diff/PR (outside the pipeline: report only, no self-fixing) |
| `android-self-test`, `android-deliver` | Verification, handover |
| `reverse-engineer-anything` | Reverse engineer APKs, binaries, app behavior, network captures, or decompiled code with REA |

Every time an agent gets something wrong: add one rule line to the right place (`RULES.md`, `CONTEXT.md`, or the skill).
