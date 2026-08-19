/**
 * Type declaration for the sibling CSS module.
 *
 * The wildcard in ../css-modules.d.ts covers this import only when a tsconfig
 * has that file in its `include` set; an editor that resolves this file
 * against the host tsconfig.json (which excludes src/client) or an inferred
 * project never loads it and reports TS2307. A sibling `.css.d.ts` is found
 * by ordinary module resolution in every context, so the import type-checks
 * no matter which project the tooling picked.
 */
declare const classes: Record<string, string>
export default classes
