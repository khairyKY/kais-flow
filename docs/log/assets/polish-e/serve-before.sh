#!/bin/sh
# Polish E "before" build: the branch's base (0fc3216, = release-1's app/ today), same local stack, port 5248.
cd /tmp/claude-0/-home-user-kais-flow/4c51f1f6-8c0c-5a38-98ca-3bf7d2349086/scratchpad/pe/before/app || exit 1
npx vite build > /tmp/claude-0/-home-user-kais-flow/4c51f1f6-8c0c-5a38-98ca-3bf7d2349086/scratchpad/pe/build-before.log 2>&1 || exit 1
exec npx vite preview --port 5248 --strictPort > /tmp/claude-0/-home-user-kais-flow/4c51f1f6-8c0c-5a38-98ca-3bf7d2349086/scratchpad/pe/preview-before.log 2>&1
