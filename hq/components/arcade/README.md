# Agent Arcade

The animated view of agents at work, built to leave Agent HQ and live on its own (an open source release is planned).

This folder depends only on React: no Next.js, no GitHub, nothing else from Agent HQ. To extract it, copy the folder as is.

| File | Role |
| --- | --- |
| `types.ts` | The contract: `ArcadeSnapshot` (rooms, zones, agents, items) and `ArcadeSource` |
| `Arcade.tsx` | The `<Arcade>` component and the `useArcadeSource` hook |
| `Sprite.tsx` | The pixel-art mascot, its moves and accessories |
| `palette.ts` | Colors and accessory per role, overridable |
| `arcade.css` | Self-contained styles, colors adjustable through `--arcade-*` variables |

## Usage

```tsx
<Arcade snapshot={snapshot} onSelect={(id) => open(id)} />
// or, with a source that publishes snapshots:
<Arcade source={{ subscribe: (push) => { const es = new EventSource("/feed"); es.onmessage = (e) => push(JSON.parse(e.data)); return () => es.close(); } }} />
```

Each room has five slots: `main` (the large area, usually desks), `side`, `corner`, `bottom`, `bottomCorner`. A zone holds desks (`desks`), agents (`agents`) or clickable items (`tray`).

Moves: `idle` (sleeps), `queued` (taps its foot), `preparing` (paces), `working` (types, with sparks), `reviewing` (inspects), `blocked` (raises its hand, with a "?" bubble), `failed` (knocked out).

In Agent HQ, `lib/arcade-adapter.ts` turns the world derived from GitHub into an `ArcadeSnapshot`. Any other agent platform only needs its own adapter.
