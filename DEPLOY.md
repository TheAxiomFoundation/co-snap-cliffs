# Deploy

Two services, both under PolicyEngine accounts — same layout as
[finbot-snap-demo](https://github.com/TheAxiomFoundation/finbot-snap-demo/blob/main/DEPLOY.md):

| Where | What | Why |
|---|---|---|
| **Modal** (`co-snap-cliffs`) | `axiom-rules-engine` binary + rulespec-us + rulespec-us-co + the compiled CO SNAP artifact, behind a `POST /run` endpoint that supports parameter overrides via patch-and-recompile. | Vercel can't run native binaries or hold the rule trees on disk. |
| **Vercel** (`co-snap-cliffs`) | Next.js app — household form, reform sliders, three Recharts panels, the `/api/cliff-sweep` route that proxies to Modal. | Standard Next.js deploy target. |

Vercel reads the Modal URL from `AXIOM_ENGINE_URL`. Locally, when that env
var is unset, the dev server spawns the binary directly — so `bun run dev`
still works without either service.

## 1. Deploy the engine to Modal

```bash
# One-time: install + auth into PolicyEngine's Modal workspace.
pip install modal
modal token set --token-id <id> --token-secret <secret>   # PolicyEngine workspace

# Deploy. First build compiles Rust (~3-4 min). Subsequent deploys reuse
# the cached layer unless ENGINE_VERSION in modal_app.py changes.
modal deploy modal_app.py
```

Modal prints a public URL of the form:

```
https://policyengine--co-snap-cliffs-web.modal.run
```

Copy it. Verify it works:

```bash
curl https://policyengine--co-snap-cliffs-web.modal.run/health
# → { "ok": true, "binary": "...", "programs": { "co-snap": { "exists": true } } }
```

A `POST /run` smoke test (baseline, no overrides):

```bash
curl -sS -X POST https://policyengine--co-snap-cliffs-web.modal.run/run \
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

To re-deploy after a `rulespec-us-co` change, bump `ENGINE_VERSION` in
`modal_app.py` and run `modal deploy` again.

## 2. Deploy the frontend to Vercel

```bash
# One-time: link this repo to a Vercel project under the PolicyEngine team.
npm i -g vercel
vercel login
vercel link --scope policyengine
```

Set the env var Vercel needs:

```bash
vercel env add AXIOM_ENGINE_URL   # paste the Modal URL, all envs
```

Deploy:

```bash
vercel --prod
```

After Vercel deploys, the Next.js `/api/cliff-sweep` route picks up
`AXIOM_ENGINE_URL` and proxies every request to Modal — no local binary
needed. The slider sweep round-trip is bound by the Modal HTTP call
(~70 ms with overrides, ~30 ms without, plus network).
