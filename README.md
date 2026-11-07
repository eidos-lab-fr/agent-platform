# agent-platform

Plateforme de développement piloté par agents pour les repos de `eidos-lab-fr`.

## Ce qu'elle fait

Sur chaque repo branché :

1. Un ticket avec un label `scope:<x>` puis `ready-for-dev` déclenche l'**agent de dev** du scope. Il lit la spec, écrit les tests, code et ouvre une PR sur une branche `agent/<numéro>-<slug>`.
2. Chaque PR `agent/*` passe par **3 agents de review** en parallèle : spec et périmètre, sécurité, tests. Le verdict pose `review:ok` ou `review:changes`.
3. Un commentaire `@claude` sur un ticket ou une PR lance une correction.
4. Le **board d'org** suit chaque ticket : En développement → PR ouverte → Revue humaine, ou Bloqué si un agent pose `needs-human`.

## Organisation

| Dossier | Contenu |
| --- | --- |
| `.github/workflows/reusable-*.yml` | La logique des agents, appelée par chaque repo |
| `.github/workflows/onboard-repo.yml` | Branche un nouveau repo en un clic |
| `.github/workflows/board-setup.yml` | Configure le board d'org (colonnes et identifiants) |
| `agents/` | Règles communes : agent de dev, agent sans scope, 3 relecteurs, agent d'onboarding |
| `templates/` | Fichiers déposés dans chaque repo : appelants, template de ticket |
| `scripts/set-status.sh` | Déplace une carte sur le board |

Chaque repo garde ce qui lui est propre dans `.github/agents/` : un fichier `dev-<scope>.md` par scope, et en option `_commun-dev.md` et `review-<relecteur>.md`, qui s'ajoutent aux règles communes.

## Brancher un nouveau repo

1. **Actions** → **Onboarder un repo** → **Run workflow**, avec le nom du repo.
2. Relire et merger la PR ouverte par l'agent d'onboarding.
3. Protéger la branche par défaut si l'org n'a pas de ruleset global.

## Prérequis (une fois)

- Secrets de ce repo : `ANTHROPIC_API_KEY`, `PROJECT_TOKEN` (token classique avec les scopes `repo`, `project`, `workflow`).
- **Settings → Actions → General → Access** : accessible depuis les repos de l'org.
- App GitHub Claude installée sur tous les repos de l'org.
- Board d'org configuré avec **Configuration du board**.

Toute modification de ce repo s'applique immédiatement à tous les repos branchés : la tester d'abord sur `agent-sandbox`.
