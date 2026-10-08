# Phone-dor

A grim, grounded party RPG for the phone, in the spirit of *Betrayal at Krondor*,
set in the world of DiggyDwarves and Rootwake during the long sleep of the Eight.
See [WORLD.md](WORLD.md) for the setting.

**Chapter One: The Anvil Road.** Three travellers from the Moot walk east to learn
why Anviltooth's forges went quiet. Manage the clock, rations, health and stamina,
choose the high road or the low, and decide each night whether to light a fire and
who keeps watch.

## Run it

```
npm install
npm run dev      # serves on your LAN; open it on your phone
npm test         # rules + content checks
npm run build    # type-check + production build into dist/
```

Pushing to `main` deploys to GitHub Pages (`.github/workflows/pages.yml`). On a
phone, open the Pages URL and use *Add to Home Screen* to play it full-screen.

## Layout

- `src/state.ts` – game state, party, save/load, seeded RNG
- `src/rules.ts` – clock, upkeep, rest, encounter odds, combat (pure, tested)
- `src/game.ts` – player actions (travel, camp, inn, scene choices)
- `src/content/road.ts` – the chapter's map: nodes, roads, karst positions
- `src/content/scenes.ts` – arrival events and roadside encounters
- `src/sky.ts` – the sky panorama with the karst columns
- `src/main.ts` – rendering and input
