#!/usr/bin/env bash
# Place un ticket ou une PR dans une colonne du board GitHub Projects.
# usage : set-status.sh <url du ticket ou de la PR> <id de l'option Status>
# Variables d'environnement : GH_TOKEN (scopes repo + project), PROJECT_ID, STATUS_FIELD_ID
# Passe uniquement par l'API GraphQL : pas besoin du scope read:org.
set -euo pipefail

URL="${1:-}"
OPTION="${2:-}"

if [ -z "$URL" ] || [ -z "$OPTION" ] || [ -z "${PROJECT_ID:-}" ] || [ -z "${STATUS_FIELD_ID:-}" ]; then
  echo "Board non configuré (variables PROJECT_ID, STATUS_FIELD_ID ou OPT_* manquantes) : étape ignorée."
  exit 0
fi

CONTENT_ID=$(gh api graphql -f url="$URL" -f query='
  query($url: URI!) {
    resource(url: $url) { ... on Issue { id } ... on PullRequest { id } }
  }' --jq '.data.resource.id')

if [ -z "$CONTENT_ID" ] || [ "$CONTENT_ID" = "null" ]; then
  echo "Ticket introuvable : $URL"
  exit 1
fi

ITEM=$(gh api graphql -f project="$PROJECT_ID" -f content="$CONTENT_ID" -f query='
  mutation($project: ID!, $content: ID!) {
    addProjectV2ItemById(input: { projectId: $project, contentId: $content }) { item { id } }
  }' --jq '.data.addProjectV2ItemById.item.id')

gh api graphql -f project="$PROJECT_ID" -f item="$ITEM" -f field="$STATUS_FIELD_ID" -f option="$OPTION" -f query='
  mutation($project: ID!, $item: ID!, $field: ID!, $option: String!) {
    updateProjectV2ItemFieldValue(input: {
      projectId: $project, itemId: $item, fieldId: $field,
      value: { singleSelectOptionId: $option }
    }) { projectV2Item { id } }
  }' --silent

echo "Carte $URL déplacée (option $OPTION)."
