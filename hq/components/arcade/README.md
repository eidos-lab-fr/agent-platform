# Agent Arcade

La vue animée des agents au travail, conçue pour sortir d'Agent HQ et vivre seule (projet open source envisagé).

Ce dossier ne dépend que de React : ni Next.js, ni GitHub, ni le reste d'Agent HQ. Pour l'extraire, copier le dossier tel quel.

| Fichier | Rôle |
| --- | --- |
| `types.ts` | Le contrat : `ArcadeSnapshot` (pièces, zones, agents, objets) et `ArcadeSource` |
| `Arcade.tsx` | Le composant `<Arcade>` et le hook `useArcadeSource` |
| `Sprite.tsx` | La mascotte en pixel art, ses gestes et ses accessoires |
| `palette.ts` | Couleurs et accessoire par rôle, surchargeables |
| `arcade.css` | Styles autonomes, couleurs réglables par variables `--arcade-*` |

## Utilisation

```tsx
<Arcade snapshot={snapshot} onSelect={(id) => open(id)} />
// ou, avec une source qui publie des instantanés :
<Arcade source={{ subscribe: (push) => { const es = new EventSource("/flux"); es.onmessage = (e) => push(JSON.parse(e.data)); return () => es.close(); } }} />
```

Chaque pièce a cinq emplacements : `main` (grand espace, en général des bureaux), `side`, `corner`, `bottom`, `bottomCorner`. Une zone contient des bureaux (`desks`), des agents (`agents`) ou des objets cliquables (`tray`).

Gestes : `idle` (dort), `queued` (piétine), `preparing` (fait les cent pas), `working` (tape, étincelles), `reviewing` (inspecte), `blocked` (lève la main, bulle « ? »), `failed` (K.O.).

Dans Agent HQ, `lib/arcade-adapter.ts` traduit le monde déduit de GitHub en `ArcadeSnapshot`. Une autre plateforme d'agents n'a qu'à écrire son propre adaptateur.
