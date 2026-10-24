# launchkit Helm Chart

Deploys launchkit (React frontend, FastAPI backend, Celery worker and beat, PostgreSQL and Redis) to any Kubernetes cluster.

## Features

- **Application stack:** the nginx-served frontend and the FastAPI backend, with local auth, passkeys, 2FA and OIDC.
- **Background jobs:** a Celery worker plus a single Celery beat for scheduled tasks.
- **Databases:** bundled PostgreSQL and Redis StatefulSets, or point at external instances.
- **Ingress or Gateway API:** standard `Ingress` or `HTTPRoute`. Both route `/api` to the backend and `/` to the frontend.

## Prerequisites

- Kubernetes 1.25+
- Helm 3.2.0+
- A PersistentVolume provisioner, for the uploaded-files volume

### Persistent storage

The backend, worker and beat mount the same files volume. **If your pods can land on different nodes, use a StorageClass with `ReadWriteMany` (RWX) access mode** (NFS, CephFS, Longhorn RWX). With `ReadWriteOnce`, pin every pod to one node.

## Quickstart

From the repository:

```bash
helm install launchkit ./charts/launchkit
```

From your registry, after `.github/workflows/release.yml` has published a release:

```bash
helm install launchkit oci://ghcr.io/<owner>/charts/launchkit --version <VERSION>
```

## Configuration

The keys under `config:` and `secret:` in `values.yaml` become the backend's environment variables (`camelCase` turns into `UPPER_SNAKE_CASE`). For example, `config.registrationEnabled` becomes `REGISTRATION_ENABLED`. To add a setting, declare it in `backend/app/core/config.py` and add the key here.

Set `backend.image.repository` and `frontend.image.repository` to your own registry.

### Secrets (production)

Pass an existing Kubernetes `Secret` instead of keeping keys in plain text in `values.yaml`:

```yaml
global:
  existingSecret: "launchkit-secrets"
```

The secret must contain the corresponding keys: `SECRET_KEY`, `DATABASE_URL`, and the `OIDC_*` secrets if you use OIDC.

## Uninstalling

```bash
helm uninstall launchkit
```

The PersistentVolumeClaims are not removed automatically, to avoid accidental data loss.
