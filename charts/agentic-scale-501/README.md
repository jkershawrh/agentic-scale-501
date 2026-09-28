# Agentic AI 501 Helm chart

The chart deploys the Triforce presentation and the qualification service as
separate, non-root, read-only workloads using digest-pinned images. The safe
default is rehearsal. Setting `qualifier.live.enabled=true` is insufficient by
itself: the referenced Secret must contain every fail-closed live gate and
dependency required by `server/config.ts`.

This chart does not install the canonical multi-agent runtime and does not
change Launchpad certification state.
