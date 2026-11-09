# ExcaliDash Helm chart

This chart deploys the ExcaliDash frontend and backend on Kubernetes, including
HPE Private Cloud AI. The default profile uses one backend replica and SQLite on
a persistent volume. The frontend proxies API and Socket.IO traffic to the
backend, so only the frontend service is exposed through Ingress.

## HPE Private Cloud AI prerequisites

- A namespace for the application.
- The frontend and backend images pushed to a registry reachable by the HPE
  cluster. Use the same immutable tag for both images.
- An image pull secret when the registry is private.
- A `ReadWriteOnce` storage class for SQLite.
- An Ingress class and a TLS secret (or cert-manager annotations).

The workloads run as non-root, drop Linux capabilities, use the RuntimeDefault
seccomp profile, disable service-account token mounting, and define resource
requests/limits. No cluster-wide RBAC or privileged container is required.

## Build and push the local images

From the repository root:

```bash
docker compose build

docker tag excalidash-frontend:latest REGISTRY/PROJECT/excalidash-frontend:sticky-notes
docker tag excalidash-backend:latest REGISTRY/PROJECT/excalidash-backend:sticky-notes

docker push REGISTRY/PROJECT/excalidash-frontend:sticky-notes
docker push REGISTRY/PROJECT/excalidash-backend:sticky-notes
```

For clusters with a different CPU architecture, publish matching or multi-arch
images with `docker buildx build --platform ... --push`.

## Configure HPE values

Copy and edit the included overlay:

```bash
cp values-hpe-private-cloud-ai.yaml my-hpe-values.yaml
```

At minimum, replace:

- both image repositories and tags,
- `global.imagePullSecrets`,
- `persistence.storageClass`,
- `ingress.className`, host, and TLS secret.

If the pull secret does not exist yet:

```bash
kubectl -n excalidash create secret docker-registry hpe-registry-credentials \
  --docker-server=REGISTRY \
  --docker-username=USERNAME \
  --docker-password=PASSWORD
```

## Install

```bash
helm upgrade --install excalidash ./deploy/helm/excalidash \
  --namespace excalidash \
  --create-namespace \
  -f my-hpe-values.yaml \
  --wait \
  --timeout 10m
```

Run the chart test:

```bash
helm test excalidash -n excalidash
```

## Secrets

When no existing secret is configured, Helm creates stable random JWT and CSRF
secrets. To provide a managed secret instead, create keys named `jwt-secret` and
`csrf-secret`, then set:

```yaml
backend:
  existingSecret: excalidash-managed-secrets
```

The JWT value must be at least 32 characters. Key names can be changed through
`backend.secretKeys`.

## Persistence and scaling

The generated PVC is marked with `helm.sh/resource-policy: keep`, so uninstalling
the release does not delete the SQLite claim. Back it up separately.

SQLite supports only one backend replica in this chart. The frontend can be
scaled independently. For multiple backend replicas, use PostgreSQL and a
separate production values profile instead of changing `backend.replicaCount`.

## Upgrade and rollback

Use immutable image tags:

```bash
helm upgrade excalidash ./deploy/helm/excalidash \
  -n excalidash -f my-hpe-values.yaml --wait --timeout 10m

helm rollback excalidash -n excalidash
```
