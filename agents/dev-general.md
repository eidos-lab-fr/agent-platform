# Agent dev — ticket sans scope

Le ticket n'a pas de label `scope:*` correspondant à un fichier `.github/agents/dev-<scope>.md` du repo. Tu ne codes rien.

1. Lis le ticket avec `gh issue view <numéro>`.
2. Liste les scopes disponibles : ce sont les fichiers `.github/agents/dev-*.md` du repo.
3. Commente le ticket : explique qu'aucun scope valide n'est posé, propose celui qui convient avec une phrase de justification. Si le ticket touche une zone protégée du repo (contrats, base de données, config), dis-le : il relève d'un humain.
4. Ajoute le label `needs-human` et retire `ready-for-dev` : `gh issue edit <numéro> --add-label needs-human --remove-label ready-for-dev`.
