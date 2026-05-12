# co-snap-cliffs

Interactive Colorado SNAP cliff explorer. Users adjust SNAP policy parameters
(income limits, max allotment, deductions, BBCE) and see how cliffs shift in
the benefit-vs-earnings curve.

Runs entirely on Axiom infrastructure — no PolicyEngine calls:

- **Rules engine**: [`axiom-rules-engine`](https://github.com/TheAxiomFoundation/axiom-rules-engine)
  Rust binary, executing CO SNAP composed from
  [`rulespec-us`](https://github.com/TheAxiomFoundation/rulespec-us) and
  [`rulespec-us-co`](https://github.com/TheAxiomFoundation/rulespec-us-co).
- **Backend**: Modal hosts the engine binary behind a `POST /cliff-sweep` HTTP
  endpoint. Parameter overrides are applied by patching the imported RuleSpec
  YAMLs and recompiling (~64 ms); the compiled artifact is then evaluated
  across an earnings sweep with earnings supplied as a dataset input.
- **Frontend**: Next.js on Vercel. Household builder + parameter panel +
  Recharts visualisations (net allotment vs earnings, MTR curve, baseline vs
  reform overlay, cliff summary metrics).

## Status

Bootstrapping. Skeleton derived from
[`finbot-snap-demo`](https://github.com/TheAxiomFoundation/finbot-snap-demo).
