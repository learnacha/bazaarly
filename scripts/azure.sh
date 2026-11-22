#!/usr/bin/env bash
# Bring the Azure deployment up or down on demand.
#   ./scripts/azure.sh up       build + deploy everything (calls azure-containerapp.sh)
#   ./scripts/azure.sh down     DELETE the whole resource group: app, environment, registry, logs.
#                               Nothing billable remains. Add --yes to skip the prompt.
#   ./scripts/azure.sh status   show what exists right now
# Your Neon database is outside Azure and is never touched, so no data is lost on `down`.
# Note: `up` after `down` creates a NEW public URL and a new auth secret (users must sign in again).
set -euo pipefail
cd "$(dirname "$0")/.."

RG=${RG:-bazaarly-rg}
STATE=.azure-aca-state
cmd=${1:-status}; shift || true

az account show >/dev/null 2>&1 || { echo "Not logged in. Run: az login --scope https://management.core.windows.net//.default"; exit 1; }

group_exists() { [ "$(az group exists -n "$RG")" = true ]; }

status() {
  echo "Subscription: $(az account show --query name -o tsv)"
  if ! group_exists; then echo "Resource group $RG: absent (no Azure billing for bazaarly)"; return; fi
  echo "Resource group $RG: present. Resources:"
  az resource list -g "$RG" --query "[].{name:name,type:type}" -o table
  FQDN=$(az containerapp show -g "$RG" -n "${APP:-bazaarly}" --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || true)
  [ -z "$FQDN" ] || echo "URL: https://$FQDN"
}

case "$cmd" in
  up)
    ./scripts/azure-containerapp.sh
    ;;
  down)
    if ! group_exists; then echo "Nothing to delete: $RG does not exist."; status; exit 0; fi
    echo "This permanently deletes everything in $RG:"
    az resource list -g "$RG" --query "[].{name:name,type:type}" -o table
    if [ "${1:-}" != "--yes" ]; then
      read -r -p "Type the resource group name ($RG) to confirm: " ans
      [ "$ans" = "$RG" ] || { echo "Aborted."; exit 1; }
    fi
    az group delete -n "$RG" --yes   # waits until deletion completes
    rm -f "$STATE"                    # next `up` picks a fresh, unique registry name
    # Verify nothing is left: the group is gone and no stray managed-environment group remains.
    group_exists && { echo "ERROR: $RG still exists"; exit 1; }
    LEFT=$(az group list --query "[?starts_with(name,'ME_bazaarly') || name=='$RG'].name" -o tsv)
    [ -z "$LEFT" ] || { echo "ERROR: leftover groups: $LEFT"; exit 1; }
    echo "Down: all bazaarly Azure resources deleted. Billing stops."
    ;;
  status)
    status
    ;;
  *)
    echo "Usage: $0 up | down [--yes] | status"; exit 2
    ;;
esac
