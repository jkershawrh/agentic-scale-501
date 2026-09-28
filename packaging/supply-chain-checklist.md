# Candidate image supply-chain checklist

This is a release evidence checklist, not a certification record. Leave an item unchecked until the command output or signed record is retained by the release owner.

## Build identity

- [ ] Approved digest recorded for each base image; no tag-only base remains in the release Containerfile.
- [ ] Build ran with `--arch amd64` on an approved builder.
- [ ] Image inspection reports only `linux/amd64`; no multi-architecture index was created.
- [ ] Output image digest and source revision or source snapshot digest are recorded.
- [ ] Build logs contain no credentials, tokens, kubeconfigs, or private endpoints.

## SBOM and scan

- [ ] An SPDX JSON or CycloneDX JSON SBOM was generated from the image digest.
- [ ] The SBOM is stored with the candidate and its SHA-256 is recorded.
- [ ] A vulnerability scan ran against the same digest, not a mutable tag.
- [ ] Results were reviewed under an explicitly approved severity and exception policy.
- [ ] Any exception names an owner, expiry, affected package, vulnerability, and compensating control.

## Signature and provenance

- [ ] The image digest was signed using the approved keyless identity or managed signing key.
- [ ] Signature verification was performed with the intended issuer/identity or public-key policy.
- [ ] Build provenance identifies source, builder, inputs, commands, platform, and output digest.
- [ ] Provenance is attached or stored with the digest and independently verified.
- [ ] SBOM, scan, signature, and provenance all resolve to the identical image digest.

## Registry and pull verification

- [ ] Registry destination and retention policy were approved.
- [ ] The pushed digest equals the locally verified digest.
- [ ] A clean environment pulled the image by digest.
- [ ] The pulled image reports `linux/amd64` and runs as non-root with a read-only root filesystem.
- [ ] `/healthz`, `/readyz`, the presentation route, and static assets were checked.
- [ ] `/api/scale/run` and other live capabilities remain unavailable.
- [ ] Deployment evidence labels the result as rehearsal-only and makes no certification claim.

