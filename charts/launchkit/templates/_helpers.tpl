{{/*
Expand the name of the chart.
*/}}
{{- define "launchkit.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "launchkit.fullname" -}}
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

{{/*
Common labels
*/}}
{{- define "launchkit.labels" -}}
helm.sh/chart: {{ include "launchkit.chart" . }}
app.kubernetes.io/name: {{ include "launchkit.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "launchkit.selectorLabels" -}}
app.kubernetes.io/name: {{ include "launchkit.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "launchkit.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "launchkit.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "launchkit.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Compute the frontend URL based on global.domain and global.tls
*/}}
{{- define "launchkit.frontendUrl" -}}
{{- if .Values.global.tls -}}
https://{{ .Values.global.domain }}
{{- else -}}
http://{{ .Values.global.domain }}
{{- end -}}
{{- end -}}

{{/* select-stack:begin multi */}}
{{/*
Backend stack: python (default) or node. Anything else fails the render.
*/}}
{{- define "launchkit.backendStack" -}}
{{- $stack := default "python" .Values.backend.stack -}}
{{- if not (has $stack (list "python" "node")) -}}
{{- fail (printf "backend.stack must be python or node (got: %s)" $stack) -}}
{{- end -}}
{{- $stack -}}
{{- end -}}

{{/*
Image of the backend stack in use (API, migration job, worker and scheduler share it).
*/}}
{{- define "launchkit.backendImage" -}}
{{- if eq (include "launchkit.backendStack" .) "node" -}}
{{ .Values.backend.nodeImage.repository }}:{{ .Values.backend.nodeImage.tag }}
{{- else -}}
{{ .Values.backend.image.repository }}:{{ .Values.backend.image.tag }}
{{- end -}}
{{- end -}}
{{/* select-stack:end */}}
