#!/usr/bin/env bash
# Place un ticket dans une colonne du board GitHub Projects.
# usage : set-status.sh <url du ticket> <id de l'option Status>
# Variables d'environnement : GH_TOKEN (PROJECT_TOKEN), ORG, PROJECT_NUMBER, PROJECT_ID, STATUS_FIELD_ID
set -euo pipefail

URL="${1:-}"
OPTION="${2:-}"

if [ -z "$URL" ] || [ -z "$OPTION" ] || [ -z "${PROJECT_NUMBER:-}" ] || [ -z "${PROJECT_ID:-}" ] || [ -z "${STATUS_FIELD_ID:-}" ]; then
  echo "Board non configuré (variables PROJECT_* ou OPT_* manquantes) : étape ignorée."
  exit 0
fi

ITEM=$(gh project item-add "$PROJECT_NUMBER" --owner "$ORG" --url "$URL" --format json --jq .id)
gh project item-edit --id "$ITEM" --project-id "$PROJECT_ID" \
  --field-id "$STATUS_FIELD_ID" --single-select-option-id "$OPTION"
echo "Ticket $URL déplacé (option $OPTION)."
