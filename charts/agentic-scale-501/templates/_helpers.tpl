{{- define "agentic-scale-501.labels" -}}
app.kubernetes.io/part-of: agentic-scale-501
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ .Chart.Name }}-{{ .Chart.Version | replace "+" "_" }}
{{- end -}}

{{- define "agentic-scale-501.securityContext" -}}
allowPrivilegeEscalation: false
capabilities:
  drop: ["ALL"]
readOnlyRootFilesystem: true
runAsNonRoot: true
{{- end -}}
