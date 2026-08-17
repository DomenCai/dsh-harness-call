/**
 * The shell contracts this half plugs into, restated where the shell does not
 * ship them to us.
 *
 * Three of the four seams arrive by declaration merging from packages we DO
 * have: `@deepseek-ai/dsh-client-ui-layout/client` brings the `shell.overlay`
 * seat this half floats its panel in, the locale plugin brings `ctx.locale`,
 * the input-trigger plugin brings `ctx.inputTriggers`. All three are type-only
 * imports — erased before the bundler sees them, so the client-bundle purity
 * gate never fires.
 *
 * `tool.call.toolview` is declared by `@deepseek-ai/dsh-client-ui-tool`, which
 * is not one of this package's dependencies, so its contract is declared here.
 * Only the members this plugin actually reads are stated: the slot is keyed by
 * tool name and hands the entry the call's identity plus the running-or-settled
 * node it was rendered for. The node type itself is NOT restated — it is
 * {@link ToolCallBlock} from the runtime, the same union the real declaration
 * uses, so the `'kind' in block` discrimination the readers in ./runs.ts perform
 * is checked rather than assumed.
 *
 * @module dsh-harness-call/client/contracts
 */
export {};
