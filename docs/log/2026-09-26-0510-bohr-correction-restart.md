---
date: 2026-09-26 05:10 UTC
session: bohr
type: correction
related: FIX-0, FIX-2, FIX-6, J-11, T-2
supersedes: none — corrects 2026-09-26-0500-bohr-status.md and adds to 2026-09-26-0450-bohr-decision-local-stack.md
---

# Container restart ~04:45 UTC — what was lost, and a timestamp correction

**Timestamp correction:** the entries named `…-0500-…status` and `…-0520-…decision-kc-rides-release` were written at about 04:35 and 04:40 UTC. Their filenames overstate the time. Their content stands.

**Lost in the restart:** all in-flight workers. Their state afterwards:
- T-2: **finished and pushed before the restart** (`e76488c`, handoff `2026-09-26-0436-t2-handoff.md`). Conductor-reviewed: OK.
- FIX-0: partial and uncommitted in its worktree. Saved as WIP `603cf45` on `claude/fix0-edge-auth`: auth + CORS helpers, all six functions edited, no migration, unverified.
- FIX-2, J-11, FIX-6: no surviving work. Re-dispatched from scratch.
- The local Docker + Supabase stack stopped. Its data volume survived.

**Restart recovery recipe** (adds to the local-stack entry):
1. `nohup containerd &` first. On its own, `dockerd` times out waiting for its managed containerd after a restart.
2. `nohup dockerd --containerd=/run/containerd/containerd.sock &`.
3. Images may be gone. If `supabase start` fails on `public.ecr.aws` (Forbidden) or ghcr (blocked by policy), `docker pull supabase/<image>:<tag>` from Docker Hub for each missing image, then `supabase start` again. The DB restores from its volume.

**New rule for workers:** WIP commit + push at least after every major step, so a restart costs minutes, not the task.
