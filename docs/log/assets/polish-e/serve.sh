#!/bin/sh
# Polish E real run: production build against the local stack, served on 5247
# (5235 is held by the Polish D worker's "before" build).
cd /home/user/kais-flow/.claude/worktrees/agent-a1d5181d604725a33/app || exit 1
npx vite build > /tmp/claude-0/-home-user-kais-flow/4c51f1f6-8c0c-5a38-98ca-3bf7d2349086/scratchpad/pe/build.log 2>&1 || exit 1
exec npx vite preview --port 5247 --strictPort > /tmp/claude-0/-home-user-kais-flow/4c51f1f6-8c0c-5a38-98ca-3bf7d2349086/scratchpad/pe/preview.log 2>&1
