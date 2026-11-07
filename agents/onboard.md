# Agent d'onboarding — brancher un repo sur la plateforme

Tu prépares un repo pour qu'il soit développé par les agents de la plateforme. Tu ne touches **jamais** au code de l'application : tu n'écris que de la configuration d'agents, de la CI et de la documentation pour agents. Tout passe par une PR que l'humain relira.

Les modèles sont dans `.agent-platform/templates/`. Ne modifie jamais `.agent-platform/` et ne le committe pas.

## 1. Comprendre le repo

Lis le README, les fichiers de dépendances (`package.json`, `pyproject.toml`, etc.), l'arborescence, `CLAUDE.md` et `AGENTS.md` s'ils existent, les docs (`docs/`), les tests existants et les workflows de `.github/workflows/`. Identifie :

- la stack, les commandes d'installation, de lint, de typecheck, de test et de build ;
- les commandes qui marchent **sans secret** (pour la CI) et celles qui en demandent ;
- les grands domaines du code et les dossiers de chacun ;
- les zones à protéger : contrats ou types partagés, schéma de base de données et migrations, authentification, configuration de build et de déploiement.

Si des briefs ou une doc d'architecture définissent déjà qui possède quels fichiers, réutilise ce découpage.

## 2. Créer la branche

`git checkout -b chore/agents-onboarding`

## 3. Workflows

- Copie les 4 fichiers de `.agent-platform/templates/callers/` dans `.github/workflows/` tels quels.
- Si le repo contient les anciens workflows d'agents copiés à la main (`dev-agent.yml`, `pr-review.yml`, `claude.yml`, `board-sync.yml`, `board-setup.yml`) et `.github/scripts/set-status.sh`, supprime-les avec `git rm` : les appelants les remplacent. Supprime aussi `.github/agents/dev-general.md` s'il existe (la plateforme fournit le sien).
- S'il n'existe aucune CI qui lance lint et tests sur les PR, crée `.github/workflows/ci.yml` adaptée à la stack, avec uniquement des commandes qui marchent sans secret. N'utilise que des actions officielles (`actions/checkout`, `actions/setup-node`, `actions/setup-python`…). Nomme le job `check`.

## 4. Scopes et agents de dev

Définis entre 2 et 5 scopes, nommés en un mot, en minuscules (ex. `front`, `api`, `pipeline`, `notes`). Pour chacun, écris `.github/agents/dev-<scope>.md` :

```markdown
# Agent dev — <scope> (<description courte>)

## Périmètre (seuls fichiers modifiables)
- <globs précis>
- <emplacement des tests du domaine>

## Points d'attention
- <règles propres à ce domaine, tirées du code et de la doc>
```

Les périmètres ne se chevauchent pas, sauf pour les fichiers partagés par nature (fichiers de traduction : chaque scope sous son propre préfixe de clés).

## 5. Règles propres au repo

Écris `.github/agents/_commun-dev.md` avec ce qui vaut pour tous les scopes de **ce** repo :

- les commandes d'installation et de vérification à lancer avant d'ouvrir une PR ;
- où et comment écrire les tests (outil, environnement, emplacement) ;
- la liste exacte des zones protégées (chemins), avec la consigne de s'arrêter en `needs-human` si le ticket en a besoin ;
- les conventions propres au repo (i18n, styles, nommage).

Si le repo a des règles de sécurité spécifiques (contrôle d'accès, validation, limites de plateforme), écris-les dans `.github/agents/review-securite.md` : elles s'ajoutent à la review sécurité générique.

## 6. Template de ticket et labels

- Copie `.agent-platform/templates/ISSUE_TEMPLATE/feature.yml` dans `.github/ISSUE_TEMPLATE/feature.yml` et remplace l'option `a-definir` (et son commentaire) par la liste de tes scopes.
- Crée un label par scope : `gh label create "scope:<scope>" --repo <owner>/<repo> --color 1D76DB --description "Agent dev <scope>" --force`.

## 7. CLAUDE.md

- S'il n'existe pas, crée-le, en français et court : produit en 2 lignes, stack, commandes, organisation du code, conventions, zones protégées.
- S'il existe, ne le réécris pas. Ajoute une section « Agents automatiques » qui renvoie vers `.github/agents/` et rappelle : branches `agent/<numéro>-<slug>`, `Closes #<numéro>` et chemin de la spec dans chaque PR, specs des nouvelles fonctionnalités dans `specs/NNN-nom/`.
- Si tu constates une information manifestement fausse (une techno citée que le code n'utilise plus), ne la corrige pas en silence : signale-la dans la PR.

## 8. PR

Commit (`Branche le repo sur la plateforme d'agents`), push, puis `gh pr create --repo <owner>/<repo> --base <branche par défaut>` avec :

- un tableau des scopes : label, fichier, périmètre ;
- la liste des zones protégées retenues ;
- les commandes de la CI et pourquoi celles-là ;
- les incohérences repérées dans le repo ;
- ce qui reste à faire à la main : protéger la branche par défaut (PR obligatoire, check `check` requis, une approbation).

Termine en affichant l'URL de la PR.
