/**
 * Re-emit the auto-generated program base schemas as JSON so the Modal
 * Python service can load the same shapes. Runs as a build step before
 * `modal deploy`; output goes to engine/artifacts/<slug>-base.json,
 * which modal_app.py mounts into the image.
 *
 * Usage: bun run scripts/dump-program-bases.ts
 */
import { writeFileSync } from "node:fs";
import { CO_SNAP_BASE } from "../src/lib/programs/co-snap-base";
import { NY_SNAP_BASE } from "../src/lib/programs/ny-snap-base";

const BASES = [
  ["co-snap", CO_SNAP_BASE],
  ["ny-snap", NY_SNAP_BASE],
] as const;

for (const [slug, base] of BASES) {
  const out = `engine/artifacts/${slug}-base.json`;
  writeFileSync(out, JSON.stringify(base, null, 2) + "\n");
  console.log(
    `wrote ${out}: ${base.household_inputs.length} household inputs, ` +
      `${base.person_inputs.length} person inputs, ` +
      `${Object.keys(base.outputs_by_name).length} outputs`,
  );
}
