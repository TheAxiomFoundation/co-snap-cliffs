/**
 * Re-emit the auto-generated CO_SNAP_BASE schema as JSON so the Modal
 * Python service can load the same shape. Runs as a build step before
 * `modal deploy`; output goes to engine/artifacts/co-snap-base.json,
 * which modal_app.py mounts into the image.
 *
 * Usage: bun run scripts/dump-co-snap-base.ts
 */
import { writeFileSync } from "node:fs";
import { CO_SNAP_BASE } from "../src/lib/programs/co-snap-base";

const OUT = "engine/artifacts/co-snap-base.json";
writeFileSync(OUT, JSON.stringify(CO_SNAP_BASE, null, 2));
console.log(
  `wrote ${OUT}: ${CO_SNAP_BASE.household_inputs.length} household inputs, ` +
    `${CO_SNAP_BASE.person_inputs.length} person inputs, ` +
    `${Object.keys(CO_SNAP_BASE.outputs_by_name).length} outputs`,
);
