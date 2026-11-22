#!/usr/bin/env bash
# Build the Docker image, push it to Azure Container Registry and run it on Azure Container Apps
# (consumption plan: scales on HTTP load, down to zero when idle). Safe to re-run.
# Requires: az CLI logged in, Docker running, and a .env with DATABASE_URL.
# Optional overrides: RG, LOCATION, ACR, ENV_NAME, APP, MIN_REPLICAS, MAX_REPLICAS.
set -euo pipefail
cd "$(dirname "$0")/.."

RG=${RG:-bazaarly-rg}
LOCATION=${LOCATION:-centralindia}
STATE=.azure-aca-state          # remembers the generated unique registry name; gitignored
ACR=${ACR:-$( [ -f "$STATE" ] && cat "$STATE" || echo "bazaarly$(openssl rand -hex 3)" )}
echo "$ACR" > "$STATE"
ENV_NAME=${ENV_NAME:-bazaarly-env}
APP=${APP:-bazaarly}
MIN_REPLICAS=${MIN_REPLICAS:-0}
MAX_REPLICAS=${MAX_REPLICAS:-5}
TAG=$(date +%Y%m%d%H%M%S)
IMAGE="$ACR.azurecr.io/bazaarly:$TAG"

DATABASE_URL=$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2-)
# .env values may be quoted; strip one pair of surrounding quotes (portable bash, no sed backrefs).
DATABASE_URL=${DATABASE_URL#[\"\']}; DATABASE_URL=${DATABASE_URL%[\"\']}
[ -n "$DATABASE_URL" ] || { echo "DATABASE_URL missing in .env"; exit 1; }

az account show >/dev/null
az extension add -n containerapp -y -o none 2>/dev/null || true
for p in Microsoft.App Microsoft.ContainerRegistry Microsoft.OperationalInsights; do az provider register -n $p --wait; done

az group create -n "$RG" -l "$LOCATION" -o none
# Basic registry is the cheapest tier (~$5/month).
az acr show -g "$RG" -n "$ACR" -o none 2>/dev/null || az acr create -g "$RG" -n "$ACR" --sku Basic --admin-enabled false -o none

# The Mac is arm64 but Container Apps runs linux/amd64, so build for that platform.
docker buildx build --platform linux/amd64 -t "$IMAGE" --load .
az acr login -n "$ACR"
docker push "$IMAGE"

az containerapp env show -g "$RG" -n "$ENV_NAME" -o none 2>/dev/null || az containerapp env create -g "$RG" -n "$ENV_NAME" -l "$LOCATION" -o none

if az containerapp show -g "$RG" -n "$APP" -o none 2>/dev/null; then
  # Keep the existing secret on re-runs so users stay signed in; just roll out the new image.
  az containerapp secret set -g "$RG" -n "$APP" --secrets "db-url=$DATABASE_URL" -o none
  az containerapp update -g "$RG" -n "$APP" --image "$IMAGE" --revision-suffix "r$TAG" -o none
else
  SECRET=$(node -p "require('crypto').randomBytes(32).toString('base64')")
  az containerapp create -g "$RG" -n "$APP" --environment "$ENV_NAME" --image "$IMAGE" \
    --registry-server "$ACR.azurecr.io" --registry-identity system \
    --target-port 8080 --ingress external \
    --cpu 0.25 --memory 0.5Gi \
    --min-replicas "$MIN_REPLICAS" --max-replicas "$MAX_REPLICAS" \
    --scale-rule-name http --scale-rule-type http --scale-rule-http-concurrency 50 \
    --secrets "db-url=$DATABASE_URL" "auth-secret=$SECRET" \
    --env-vars NODE_ENV=production PORT=8080 DATABASE_URL=secretref:db-url BETTER_AUTH_SECRET=secretref:auth-secret \
    -o none
fi

FQDN=$(az containerapp show -g "$RG" -n "$APP" --query properties.configuration.ingress.fqdn -o tsv)
# Better Auth must know its public https address (it can only be known after the app exists).
az containerapp update -g "$RG" -n "$APP" --set-env-vars "BETTER_AUTH_URL=https://$FQDN" -o none
echo "Deployed: https://$FQDN"
