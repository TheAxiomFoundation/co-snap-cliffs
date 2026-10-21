# Deploy

Two services — the engine on Modal under the PolicyEngine workspace, the frontend on Vercel under the axiom-foundation scope — same layout as
[finbot-snap-demo](https://github.com/TheAxiomFoundation/finbot-snap-demo/blob/main/DEPLOY.md):

| Where | What | Why |
|---|---|---|
| **Modal** (`co-snap-cliffs`) | `axiom-rules-engine` binary + the pinned rulespec trees and prebuilt artifacts for CO and NY SNAP, behind `POST /cliff-sweep` and `POST /run` (`engine_service.py`). Parameter overrides patch the trees in place, compile, and restore. | Vercel can't run native binaries or hold the rule trees on disk. |
| **Vercel** (`axiom-co-snap`, served at axiom.org/gallery/cliffs) | Next.js app — household form, reform sliders, three Recharts panels, the `/api/cliff-sweep` route that proxies to Modal. | Standard Next.js deploy target. |

Vercel reads the Modal URL from `AXIOM_ENGINE_URL`. Locally, when that env
var is unset, the dev server spawns the binary directly — so `bun run dev`
still works without either service.

## 1. Deploy the engine to Modal

```bash
# One-time: install + auth into PolicyEngine's Modal workspace.
pip install modal
modal token set --token-id <id> --token-secret <secret>   # PolicyEngine workspace

# The image bakes the program schemas from engine/artifacts (gitignored).
# Regenerate them from the committed TS base modules first.
bun run scripts/dump-program-bases.ts

# Deploy. An engine-layer rebuild compiles Rust (~3-4 min); a pin or
# TREES_VERSION bump in engine_pins.py / modal_app.py rebuilds only the
# trees layer.
modal deploy modal_app.py
```

To try a change before it replaces production, `modal serve modal_app.py`
serves it as an ephemeral app at
`https://policyengine--co-snap-cliffs-dev.us-east.modal.run` until you stop it.

Modal prints a public URL of the form:

```
https://policyengine--co-snap-cliffs.modal.run
```

> The hostname is the Modal function label — modal_app.py sets `asgi_app(label="co-snap-cliffs")`, so the URL carries no `-web` suffix. Rename the label and every literal here rots: trust the URL `modal deploy` prints.

Copy it. Verify it works:

```bash
curl https://policyengine--co-snap-cliffs.modal.run/health
# → { "ok": true, "binary": "...", "programs": { "co-snap": { "exists": true } } }
```

A `POST /run` smoke test (baseline, no overrides):

```bash
curl -sS -X POST https://policyengine--co-snap-cliffs.modal.run/run \
  -H "Content-Type: application/json" \
  -d '{
    "program": "co-snap",
    "request": {
      "mode": "explain",
      "dataset": { "inputs": [], "relations": [] },
      "queries": []
    }
  }' | head -c 200
```

To move a rulespec pin, edit `engine_pins.py`, regenerate the program's
base module (`scripts/generate-program-base.py`), and redeploy. `/health`
reports a `prewarm` state per program: `ok` means the in-place tree
compiles to the baked artifact byte for byte; `mismatch` means it drifted.

### Cold starts

The app scales to zero five minutes after the last request. A cold
container boots in ~4-5 s and starts a background prewarm that compiles
each program once. Measured on 2026-10-21: a reform as the very first
request on a cold container answered in 3.3 s, and reforms on a warm one
in 0.3-0.8 s, concurrent requests included. (The old per-request copy of
both rulespec trees took 72-90 s on a cold container, past Vercel's 60 s
function limit; see `engine_service.py`.)

## 2. Deploy the frontend to Vercel

```bash
# One-time: link to the serving project under the axiom-foundation team.
# (The separate co-snap-cliffs Vercel project only redirects into the
# gallery — see vercel.json in this repo.)
npm i -g vercel
vercel login
vercel link --scope axiom-foundation --project axiom-co-snap
```

Set the env var Vercel needs:

```bash
vercel env add AXIOM_ENGINE_URL   # paste the Modal URL, all envs
```

Deploy (the project has no Git integration, so merges to `main` do not
ship the frontend; deploy from an up-to-date `main` checkout):

```bash
vercel --prod --scope axiom-foundation
```

After Vercel deploys, the Next.js `/api/cliff-sweep` route picks up
`AXIOM_ENGINE_URL` and proxies every request to Modal — no local binary
needed. The route gives up on Modal after 50 s and answers 504, and the
page retries a gateway error once before showing it.
