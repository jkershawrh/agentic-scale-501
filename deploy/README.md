# OpenShift deployment preparation

`base/` is a pre-release deployment shape for the static rehearsal presentation. It is intentionally undeployable as committed: the image points at `registry.invalid` with a zero digest. Replace that reference only after the candidate has passed the supply-chain checklist.

The Deployment is non-root, drops all capabilities, prevents privilege escalation, uses the runtime-default seccomp profile, disables the service-account token, mounts only a bounded writable `/tmp`, and denies all egress. The Route admits HTTPS through the OpenShift ingress namespace. If the target cluster uses different ingress namespace labels, review and patch the NetworkPolicy before deployment.

The generated ConfigMap exposes only non-sensitive, default-off state. The current image is static and does not interpret these variables; they are an auditable declaration, not an enforcement claim. The actual enforcement boundary is that no live API is packaged and no runtime Secret is mounted.

`contracts/runtime-secret-references.yaml` names future Secret references without containing any values. Do not create or mount those Secrets until the corresponding live capability has its implementation, prerequisite evidence, and explicit approval. Secret presence never constitutes approval.

## Pre-apply review

```bash
./packaging/validate-read-only.sh
oc kustomize deploy/base
```

Before any `oc apply`, also:

1. replace the placeholder with the verified AMD64 image digest;
2. validate the rendered resources against the target cluster policy;
3. confirm the namespace and ingress NetworkPolicy labels;
4. confirm all capability flags remain false;
5. retain the SBOM, scan, signature, provenance, and pull-verification records.

This packaging does not create AgnosticV content, perform a deployment, push or pull an image, or establish Showroom/Launchpad certification.
