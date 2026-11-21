# Agent HQ

Le QG web et gamifié d'agent-platform : créer des tâches, les confier aux agents, répondre quand ils bloquent et merger, sans passer par l'interface de GitHub. On y voit les agents travailler en direct dans « l'Atelier ».

GitHub reste la source de vérité. Agent HQ lit les tickets, les PR et les runs GitHub Actions des repos branchés, en déduit l'état de chaque quête et de chaque agent, et agit **avec ton propre jeton GitHub**. C'est indispensable : les workflows d'agent-platform ne démarrent que si l'expéditeur fait partie de `allowed_users`.

## Onglets

| Onglet | Contenu |
| --- | --- |
| QG | Agents au travail, mains levées (`needs-human`) avec réponse directe, PR à merger, succès, fil d'activité |
| L'Atelier | Une pièce par repo : bureaux des devs par scope, tour de relecture (spec, sécurité, tests), coin `@claude`, boîte aux lettres des PR, ta porte de merge. Jour et nuit à l'heure de Paris |
| Quêtes | Le board en chemin (Backlog → … → Done, Bloqué à part) et la forge à quêtes, avec sa jauge de clarté |
| Archipel | Les repos branchés, une carte par agent dev (quêtes livrées, taux du premier coup, délai ticket → PR), et l'onboarding d'un nouveau repo |

Une quête cliquée ouvre son panneau : lancer un agent, répondre à sa question, demander une correction à `@claude`, merger.

## Ce que font les boutons sur GitHub

| Action | Appels GitHub |
| --- | --- |
| Créer une quête | Ticket au format du formulaire « Fonctionnalité », label `scope:<x>` |
| Confier à un agent | Pose `scope:<x>`, retire puis repose `ready-for-dev` |
| Répondre à une main levée | Ajoute la réponse au corps du ticket (l'agent lit le ticket avec `gh issue view`, qui n'affiche pas les commentaires), la poste en commentaire, retire `needs-human`, relance l'agent |
| Demander à `@claude` | Commentaire `@claude …` sur la PR ouverte, sinon sur le ticket |
| Merger | Squash merge, seulement pour une branche `agent/*` qui porte `review:ok`. C'est toujours toi qui cliques |
| Explorer une île | Lance le workflow `onboard-repo.yml` d'agent-platform |

## Comment l'état est déduit

`lib/derive.ts` transforme les réponses de l'API REST en quêtes et en agents :

- **Colonne** : fermé ou PR mergée → Done ; `needs-human` → Bloqué ; PR ouverte avec `review:ok` → Revue humaine ; PR ouverte → PR ouverte ; run « Agent dev » en cours → En développement ; `ready-for-dev` → À développer ; sinon Backlog.
- **Lien PR → ticket** : branche `agent/<n>-<slug>`, sinon `Closes #n`. **Lien run → ticket** : branche, sinon titre du ticket (`display_title`).
- **Geste de l'agent dev** : l'étape en cours du job. `anthropics/claude-code-action` → « au travail », les autres étapes → « se prépare ».
- **Relecteurs** : les jobs `review (spec|securite|tests)` du run « Agents de review ».

GitHub ne donne pas les logs d'un job avant sa fin : l'Atelier montre l'étape réelle, pas chaque fichier touché.

Les colonnes « Spec en cours » et « Spec prête » n'apparaissent que si des tickets portent les labels `spec:en-cours` ou `spec:prete`. Agent HQ lit les labels, pas le board GitHub Project.

## XP et succès

100 XP par quête livrée, +50 si la PR a été mergée avec `review:ok`, +10 par quête créée. Le nombre d'agents lancés ne rapporte rien, puisque chaque lancement coûte des crédits Anthropic. Les succès sont calculés dans `lib/progress.ts` sur les 60 derniers jours.

## Lancer en local

```bash
cd hq
npm ci
npm run dev
```

Sans configuration, l'application tourne en **mode démo** : un monde simulé où des quêtes traversent tout le parcours en environ 4 minutes, avec une main levée de temps en temps. Rien n'est envoyé à GitHub.

Pour la brancher sur tes vrais repos :

1. Crée une OAuth App GitHub (Settings → Developer settings → OAuth Apps), avec comme URL de callback `<APP_URL>/api/auth/callback`.
2. Copie `.env.example` en `.env.local` et remplis `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `SESSION_SECRET` (32 caractères ou plus) et `APP_URL`.
3. `ALLOWED_LOGINS` doit correspondre à `allowed_users` des workflows.

Le jeton demandé a les scopes `repo` et `workflow` (ce dernier pour lancer l'onboarding). Il reste chiffré dans un cookie `httpOnly` et n'est jamais envoyé au navigateur. La clé Anthropic reste dans les secrets GitHub : Agent HQ n'en a pas besoin.

Les repos suivis sont ceux de `GITHUB_ORG` qui contiennent `.github/workflows/agent-dev.yml`, ou la liste fixe `HQ_REPOS`.

## Vérifications

```bash
npm run typecheck
npm test
npm run build
```

## Hébergement

N'importe quel hébergeur Node (Vercel, Fly.io, Render). Le flux en direct utilise des Server-Sent Events et interroge GitHub toutes les 10 secondes par visiteur connecté, avec un cache de 8 secondes.

## Prochaines étapes

Voir le plan : webhooks GitHub et journal d'événements en base (au lieu de l'interrogation régulière), coût par quête lu dans le fichier d'exécution de `claude-code-action`, télémétrie fine par des hooks Claude Code dans les workflows, vitrine publique en lecture seule sur eidoslab.fr.
