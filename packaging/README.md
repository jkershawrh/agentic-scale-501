# Pre-immutable-image packaging runbook

This package produces only the static Agentic AI 501 rehearsal presentation. It does not package the unattached server library, a live workflow executor, telemetry collector, fault driver, promotion controller, Antora site, or certification service.

## Local checks

From the repository root, run:

```bash
./packaging/validate-read-only.sh
node content-501/tools/rehearsal-check.mjs
npm run check
```

The first command only reads repository files. The existing application check may rebuild `dist/`.

## Candidate image plan

Do not use these commands until the two base-image tags in `image-plan.yaml` have been resolved and recorded as approved digests.

```bash
podman build \
  --arch amd64 \
  --ignorefile packaging/containerignore \
  --file packaging/Containerfile \
  --tag localhost/agentic-scale-501-presentation:candidate \
  .

podman image inspect localhost/agentic-scale-501-presentation:candidate \
  --format '{{.Architecture}} {{.Os}}'
```

The expected platform is exactly `amd64 linux`. Do not create a multi-architecture index. Do not push the candidate during this preparation phase.

After a candidate exists, `packaging/compose.yaml` provides a local-only composition bound to `127.0.0.1:8080`. It applies the same AMD64, read-only filesystem, writable `/tmp`, dropped-capability, no-new-privileges, health-check, and default-off settings. Starting it is deliberately outside the read-only validation step.

## Runtime behavior

- Port: `8080`
- Liveness: `GET /healthz` returns `200` when nginx can answer.
- Readiness: `GET /readyz` returns `200` only when the built `index.html` is present; otherwise it returns `503`.
- The root route is the rehearsal presentation and remains usable offline.
- The image has no live API listener. `/api/scale/run` is not packaged.

Deploy only by a verified image digest. The manifests under `deploy/base` deliberately contain a non-routable placeholder digest and keep all capability flags false. Secret material is never part of the image or these manifests.

Complete `supply-chain-checklist.md` before any registry push or cluster pull. That checklist records evidence; it does not confer certification.
