#!/usr/bin/env bash
set -e

echo "=== [1/3] Checking Node.js Environment ==="
node -v

echo "=== [2/3] Running Unit Tests ==="
node --test test/tool_revert.test.js

echo "=== [3/3] Verifying CLI Executable ==="
node bin/tool_revert.js help > /dev/null

echo "All verification checks passed successfully!"
