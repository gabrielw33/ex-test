{{- define "excalidash.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "excalidash.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{- define "excalidash.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "excalidash.labels" -}}
helm.sh/chart: {{ include "excalidash.chart" . }}
{{ include "excalidash.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- define "excalidash.selectorLabels" -}}
app.kubernetes.io/name: {{ include "excalidash.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{- define "excalidash.componentLabels" -}}
{{ include "excalidash.selectorLabels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "excalidash.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "excalidash.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- define "excalidash.frontendServiceName" -}}
{{- printf "%s-frontend" (include "excalidash.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "excalidash.backendServiceName" -}}
{{- printf "%s-backend" (include "excalidash.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "excalidash.persistenceClaimName" -}}
{{- if .Values.persistence.existingClaim }}
{{- .Values.persistence.existingClaim }}
{{- else }}
{{- printf "%s-data" (include "excalidash.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "excalidash.secretName" -}}
{{- default (printf "%s-secrets" (include "excalidash.fullname" .)) .Values.backend.existingSecret | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "excalidash.publicUrl" -}}
{{- if .Values.backend.frontendUrl }}
{{- .Values.backend.frontendUrl }}
{{- else if and .Values.ingress.enabled (gt (len .Values.ingress.hosts) 0) }}
{{- $scheme := ternary "https" "http" (gt (len .Values.ingress.tls) 0) }}
{{- printf "%s://%s" $scheme (index .Values.ingress.hosts 0).host }}
{{- end }}
{{- end }}
