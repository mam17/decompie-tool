# Rules

Apply to every agent (Claude Code, Codex, Gemini/Antigravity...) working in this project.
Precedence: what the user says in the current session > these rules > `AGENTS.md`/`CONTEXT.md` > skills in `.agents/skills/`.
Unsure whether an action breaks a rule → treat it as breaking the rule and ask first.

## 1. Communication
1. Reply to the user in Vietnamese. Write all agent-facing files (skills, rules, `AGENTS.md`, `CONTEXT.md`, templates, scripts), identifiers and commit messages in English. Code comments/KDoc follow the project convention.
2. Be brief and direct. No compliments, no restating the question.
3. When you must ask: ask ONE question at a time, each with a proposed default so the user can answer "ok".
4. When you have enough information, act. Do not ask about anything you can read from code, docs, or git history.

## 2. Honesty
5. Say "done" only after verification ran and passed. Report the exact commands run and their real results; on failure, paste the output.
6. State clearly what was skipped, not verified, or guessed. Never present an assumption as fact.
7. Library versions, APIs, tool configuration: check real docs or code, do not guess from memory; cite the source when it comes from the web.
8. When you got something wrong, say so plainly and fix it. Do not hide or gloss over it.

## 3. Git
9. Read-only commands are always allowed: `log`, `blame`, `show`, `diff`, `status`, `branch --list`.
10. Write commands (`commit`, `merge`, `rebase`, `push`, `cherry-pick`, create/delete branch, `checkout`/`switch`/`restore`/`reset`/`stash`/`clean`, create PR): only when the user explicitly asks for that exact action, in that session. Permission to commit is not permission to push.
11. Before any git write command: state the exact command and its effect. `git add` only the relevant files one by one, never `git add .`.
12. Never `push --force`, `reset --hard`, or `clean -fd` unless the user names it explicitly.

## 4. Scope of changes
13. Do not touch uncommitted changes you did not make. Report them; do not edit or revert them.
14. Change only what was asked. Refactors, renames, or fixes outside the scope → propose, do not do.
15. Ask first before: adding/upgrading a dependency, changing build configuration, deleting files, writing outside the project directory, any hard-to-reverse action.
16. Do not create/edit machine configuration (`local.properties`, system environment variables). Environment errors → set variables for that command session only.
17. Before deleting or overwriting: look at the target. Prefer moving to a backup over deleting.

## 5. Code and test quality
18. Read `AGENTS.md` and `CONTEXT.md` before working; use their terms, commands, and conventions.
19. Write code that looks like the surrounding code: naming, comment density, idioms.
20. Behavior changes need tests. Prefer TDD and fast JVM unit tests.
21. Never delete a test, add `@Ignore`, or change an assertion to make a test pass without understanding why it failed.
22. Self-fix a single failure at most 3 rounds. After 3: stop, report the hypotheses tried and the evidence.

## 6. Security
23. Never put secrets (API keys, keystores, passwords, tokens, `local.properties`) into code, logs, commits, or reports.
24. Do not send source code or project data to external services without the user's consent.

## 7. Finishing each task
25. Short report: what was done (with file paths), how it was verified and the result, what remains or risks, what the user needs to do.
26. When the user corrects you, or you find a new convention → propose one line in the right place: these rules (general principles), `CONTEXT.md` (project-specific), or a skill (workflow-specific).
