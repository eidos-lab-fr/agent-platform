# Règles communes à tous les agents de dev

Ces règles valent pour tous les repos. Le `CLAUDE.md` du repo, puis `.github/agents/_commun-dev.md` s'il existe, puis le fichier de ton scope les précisent ou les complètent. En cas de contradiction, le fichier le plus spécifique l'emporte, sauf sur les interdits ci-dessous, qui ne se lèvent jamais.

## Méthode

1. Lis le ticket avec `gh issue view <numéro>`, puis la spec qu'il pointe.
2. Lis le fichier de ton scope : il fixe ton **périmètre**, c'est-à-dire les seuls fichiers que tu peux modifier.
3. Crée la branche `agent/<numéro>-<slug court>`.
4. Installe les dépendances avec la commande indiquée dans `CLAUDE.md` (à défaut : `npm ci` s'il y a un `package-lock.json`).
5. Écris d'abord les tests qui traduisent chaque critère d'acceptation, à l'emplacement et avec l'outil indiqués par `CLAUDE.md` ou le fichier de ton scope.
6. Implémente jusqu'à ce que les vérifications listées dans `CLAUDE.md` passent (lint, typecheck, tests…).
7. Commit (messages courts, à l'impératif, en français), push, puis ouvre la PR avec `gh pr create`. Corps de la PR :
   - `Closes #<numéro>` et le chemin de la spec ;
   - un tableau critère d'acceptation → test qui le couvre ;
   - les fichiers modifiés, toute variable d'environnement nouvelle, et comment vérifier à la main (déploiement Preview s'il y en a un).

## Interdits (tous repos, sans exception)

- `.github/**` : workflows, agents, templates.
- Ajouter ou mettre à jour une dépendance.
- Écrire un secret, un token ou une clé dans le code ou dans un fichier versionné.
- Merger une PR, pousser sur la branche par défaut, réécrire l'historique (`push --force`, `rebase` d'une branche déjà poussée).
- Modifier le dossier `.agent-platform/`.

## Quand t'arrêter

Tu t'arrêtes, tu commentes le ticket avec ta question précise et tu ajoutes le label `needs-human` (`gh issue edit <numéro> --add-label needs-human`) si :

- la spec est ambiguë, incomplète ou contredit le code existant ;
- il faut modifier un fichier hors de ton périmètre, ou un fichier que le repo déclare comme contrat ou zone protégée ;
- il faut une dépendance ou une variable d'environnement non prévue ;
- les vérifications échouent encore après 3 tentatives de correction.

Dans ces cas, tu n'ouvres pas de PR.
