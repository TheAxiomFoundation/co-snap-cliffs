/**
 * Apply parameter overrides to a program's RuleSpec trees.
 *
 * Strategy: copy the federal rules-us tree plus the selected state tree
 * (~1.3MB) to a temp scratch dir, patch the YAMLs that hold the overridden
 * parameters, and return the path to the (untouched) root program YAML inside
 * the scratch tree.
 *
 * The scratch dirs MUST use the canonical `rulespec-us` / `rulespec-us-<state>`
 * names: the engine resolves `us:` / `us-ny:` / `us-co:` imports by walking
 * ancestors looking for a `rulespec-{prefix}` directory, and derives legal ids
 * from a `rulespec-` path component after resolving symlinks. The dev-layout
 * dirs engine/rules-us etc. are symlinks with non-canonical names, so a
 * straight copy under those names would not compile.
 *
 * The full copy keeps the implementation simple; a 1.3MB tree copies in
 * ~50ms on a local SSD, so the total cost (copy + ~64ms compile) stays well
 * under 200ms — fine for an interactive UI.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";

import type { ProgramSpec, StateRepo } from "../programs/registry";

const ROOT = path.resolve(process.cwd());

export type OverrideRepo = "rules-us" | StateRepo;

const REPO_DIRS: Record<OverrideRepo, string> = {
  "rules-us": path.join(ROOT, "engine/rules-us"),
  "rules-us-co": path.join(ROOT, "engine/rules-us-co"),
  "rules-us-ny": path.join(ROOT, "engine/rules-us-ny"),
};

/** One override targets a specific parameter inside a specific RuleSpec file.
 *
 *  `file_relative` is the path relative to its repo root (e.g.
 *  "policies/usda/snap/fy-2026-cola/maximum-allotments.yaml").
 *  `repo` selects which rules-* repo the file lives in.
 *  `parameter` is the rule's `name` inside that file.
 *  `patch` describes what to change in that parameter's version-0 entry.
 */
export interface ParameterOverride {
  repo: OverrideRepo;
  file_relative: string;
  parameter: string;
  patch:
    | { kind: "scale_values"; multiplier: number }
    | { kind: "set_values"; values: Record<number, number> }
    | { kind: "scale_formula"; multiplier: number }
    | { kind: "set_formula"; formula: string };
}

interface RuleSpecDoc {
  rules?: Array<{
    name?: string;
    kind?: string;
    versions?: Array<{
      effective_from?: string;
      values?: Record<string, number>;
      formula?: string;
    }>;
    [k: string]: unknown;
  }>;
  [k: string]: unknown;
}

function applyPatch(rule: NonNullable<RuleSpecDoc["rules"]>[number], patch: ParameterOverride["patch"]): void {
  const version = rule.versions?.[0];
  if (!version) throw new Error(`parameter ${rule.name} has no versions`);

  switch (patch.kind) {
    case "scale_values": {
      if (!version.values) throw new Error(`parameter ${rule.name} has no values to scale`);
      for (const k of Object.keys(version.values)) {
        version.values[k] = Math.round(version.values[k] * patch.multiplier);
      }
      return;
    }
    case "set_values": {
      if (!version.values) version.values = {};
      for (const [k, v] of Object.entries(patch.values)) {
        version.values[k] = v;
      }
      return;
    }
    case "scale_formula": {
      if (version.formula === undefined) {
        throw new Error(`parameter ${rule.name} has no formula`);
      }
      const n = Number(version.formula);
      if (!Number.isFinite(n)) {
        throw new Error(
          `scale_formula only supports numeric-literal formulas; ${rule.name} = ${version.formula}`,
        );
      }
      version.formula = String(Math.round(n * patch.multiplier * 100) / 100);
      return;
    }
    case "set_formula": {
      version.formula = patch.formula;
      return;
    }
  }
}

async function copyDir(src: string, dst: string): Promise<void> {
  // dereference: true is CRITICAL. The local engine layout uses symlinks
  // (engine/rules-us → ~/finbot-snap-demo/engine/rules-us) for dev speed.
  // Without dereferencing, fs.cp copies the symlink AS a symlink, and a
  // subsequent fs.writeFile on the patched path writes *through* the symlink
  // into the real source repo — silently corrupting the baseline rulespec.
  await fs.cp(src, dst, { recursive: true, dereference: true });
}

/** Write a patched rule tree for `spec`'s program and return the absolute
 *  path to the root program YAML inside it. Caller is responsible for not
 *  exploding the temp dir budget — small for now (each patch tree ~1.3MB). */
export async function writePatchedRulespec(
  spec: ProgramSpec,
  overrides: ParameterOverride[],
): Promise<string> {
  const allowedRepos: OverrideRepo[] = ["rules-us", spec.stateRepo];
  for (const ov of overrides) {
    if (!allowedRepos.includes(ov.repo)) {
      throw new Error(
        `override repo ${ov.repo} is not valid for program ${spec.slug} (allowed: ${allowedRepos.join(", ")})`,
      );
    }
  }

  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), `${spec.slug}-patches-`));
  const dstUs = path.join(tmpRoot, spec.scratchUsName);
  const dstState = path.join(tmpRoot, spec.scratchStateName);
  await Promise.all([
    copyDir(REPO_DIRS["rules-us"], dstUs),
    copyDir(REPO_DIRS[spec.stateRepo], dstState),
  ]);

  // Group overrides by file so we read/write each only once.
  const byFile = new Map<string, ParameterOverride[]>();
  for (const ov of overrides) {
    const file =
      ov.repo === "rules-us"
        ? path.join(dstUs, ov.file_relative)
        : path.join(dstState, ov.file_relative);
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file)!.push(ov);
  }

  for (const [file, fileOverrides] of byFile) {
    const text = await fs.readFile(file, "utf-8");
    const doc = yaml.load(text) as RuleSpecDoc;
    if (!doc.rules) throw new Error(`no rules array in ${file}`);
    for (const ov of fileOverrides) {
      const rule = doc.rules.find((r) => r.name === ov.parameter);
      if (!rule) throw new Error(`parameter ${ov.parameter} not found in ${file}`);
      if (rule.kind !== "parameter") {
        throw new Error(`rule ${ov.parameter} in ${file} is kind=${rule.kind}, not parameter`);
      }
      applyPatch(rule, ov.patch);
    }
    let out = yaml.dump(doc, { lineWidth: -1, quotingType: "'", forceQuotes: false });
    // js-yaml stringifies integer map keys (1, 2, ...) as quoted strings
    // (`'1':`), but the engine's spec deserializer expects bare integer keys
    // for indexed parameter tables. Unquote any purely-numeric map key.
    out = out.replace(/^(\s*)'(\d+)':/gm, "$1$2:");
    await fs.writeFile(file, out, "utf-8");
  }

  return path.join(dstState, spec.programRel);
}
