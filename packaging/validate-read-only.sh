#!/usr/bin/env bash
set -euo pipefail

repository_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repository_root"

failures=0
pass() { printf 'PASS: %s\n' "$1"; }
fail() { printf 'FAIL: %s\n' "$1" >&2; failures=$((failures + 1)); }
require_file() { [[ -f "$1" ]] && pass "$1 exists" || fail "$1 is missing"; }
require_text() {
  local file=$1 pattern=$2 label=$3
  grep -Eq -- "$pattern" "$file" && pass "$label" || fail "$label"
}

required_files=(
  content-501/packaging.yaml
  packaging/showroom/assembly.yaml
  packaging/image-plan.yaml
  packaging/Containerfile
  packaging/compose.yaml
  packaging/nginx.conf
  packaging/supply-chain-checklist.md
  deploy/base/kustomization.yaml
  deploy/base/deployment.yaml
  deploy/base/service.yaml
  deploy/base/route.yaml
  deploy/base/networkpolicy.yaml
  deploy/contracts/health-readiness.yaml
  deploy/contracts/runtime-secret-references.yaml
)
for file in "${required_files[@]}"; do require_file "$file"; done

require_text packaging/Containerfile 'FROM --platform=linux/amd64' 'container stages are AMD64-only'
require_text packaging/compose.yaml 'platform: linux/amd64' 'local composition is AMD64-only'
require_text packaging/image-plan.yaml 'outputReferencePolicy: digest-only-for-deployment' 'deployment requires a digest'
require_text deploy/base/deployment.yaml 'readOnlyRootFilesystem: true' 'root filesystem is read-only'
require_text deploy/base/deployment.yaml 'allowPrivilegeEscalation: false' 'privilege escalation is disabled'
require_text deploy/base/deployment.yaml 'runAsNonRoot: true' 'container must run as non-root'
require_text deploy/base/deployment.yaml 'path: /healthz' 'liveness path is declared'
require_text deploy/base/deployment.yaml 'path: /readyz' 'readiness path is declared'
require_text deploy/base/runtime-state.env 'LIVE_EXECUTION_ENABLED=false' 'live execution defaults off'
require_text deploy/base/runtime-state.env 'FAULT_INJECTION_ENABLED=false' 'fault injection defaults off'
require_text deploy/base/runtime-state.env 'CERTIFICATION_ENABLED=false' 'certification defaults off'
require_text deploy/base/runtime-state.env 'AUTOMATED_PROMOTION_ENABLED=false' 'automated promotion defaults off'
require_text packaging/showroom/assembly.yaml 'publishable: false' 'Showroom assembly is not publishable'
require_text content-501/packaging.yaml 'antoraComponentReady: false' 'Antora readiness is not overstated'

if grep -R -E --include='*.yaml' --include='*.yml' '^[[:space:]]*kind:[[:space:]]*Secret[[:space:]]*$|^[[:space:]]*(data|stringData):[[:space:]]*$' packaging deploy content-501/packaging.yaml >/dev/null; then
  fail 'packaging contains Secret data rather than references'
else
  pass 'no Secret object or embedded Secret data is present'
fi

if grep -R -E --include='*.yaml' --include='*.yml' --include='*.env' '(LIVE_EXECUTION_ENABLED|TELEMETRY_COLLECTION_ENABLED|FAULT_INJECTION_ENABLED|CERTIFICATION_ENABLED|AUTOMATED_PROMOTION_ENABLED)=(true|1|yes)' packaging deploy content-501/packaging.yaml >/dev/null; then
  fail 'a live capability is enabled'
else
  pass 'all live capability switches remain disabled'
fi

node content-501/tools/rehearsal-check.mjs >/dev/null \
  && pass 'rehearsal fixtures satisfy their existing read-only check' \
  || fail 'rehearsal fixture validation failed'

if (( failures > 0 )); then
  printf '%d validation failure(s).\n' "$failures" >&2
  exit 1
fi
printf 'Read-only packaging validation passed. No image was built or pushed.\n'
