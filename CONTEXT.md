# CONTEXT

## Project: tool_revert

An application reverse engineering and decompilation toolkit powered by REA (`reverse-engineer-anything`).
Supports Android APKs/XAPKs, JavaScript/Electron ASAR applications, and native binaries.

## Tech Stack

- **Runtime**: Node.js >= 22 (ESM modules, `"type": "module"`)
- **Analysis Engine**: REA (`rea-agents@6.7.0` via MCP / CLI)
- **Target Platforms**: Android (APK, DEX, resources, ADB), JavaScript / Electron (ASAR, AST), Native (PE/ELF/Mach-O)
- **Test Runner**: Node.js built-in test runner (`node --test`)
- **Structure**:
  - `bin/tool_revert.js`: CLI executable
  - `src/rea_bridge.js`: Integration bridge to REA CLI & MCP tools
  - `src/android_analyzer.js`: Android APK manifest, permissions, classes, security analyzer
  - `src/js_analyzer.js`: JavaScript & Electron AST and source recovery analyzer
  - `src/reporter.js`: Markdown and JSON structured report generator
  - `src/utils.js`: Helper utilities (SHA-256, formatting, file paths)
  - `test/`: Unit tests

## Commands

- Run CLI help: `node bin/tool_revert.js help`
- Run doctor check: `node bin/tool_revert.js doctor`
- Analyze target (APK or JS): `node bin/tool_revert.js analyze <path-to-target> [--decode-resources]`
- Run tests: `node --test test/tool_revert.test.js`
- Verification script (Windows): `powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1`
- Verification script (POSIX): `./scripts/verify.sh`

## Backups

- The previous Android puzzle game project was archived safely to `_backup_puzzle_game/`.
