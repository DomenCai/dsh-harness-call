window.__ModuleLoader__.load({
	id: "dsh-harness-call",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react_jsx_runtime = require("react/jsx-runtime");
		let react = require("react");
		let _deepseek_ai_dsh_client_ui_primitives = require("@deepseek-ai/dsh-client-ui-primitives");
		//#region lib/shared/harness.js
		/**
		* The harness roster: the one list both halves read.
		*
		* Adding a harness used to mean editing four places (the adapter table, the
		* tool's `harness` enum, the host label map, and the browser's mention list),
		* and nothing failed when one was missed. They all derive from here now, so a
		* new entry reaches the tool schema and the composer mentions at once.
		*
		* Zero runtime dependencies — see the note in ./events.ts.
		*
		* @module dsh-harness-call/shared/harness
		*/
		/** Harness keys in the order the model and the composer see them. */
		const HARNESS_KEYS = [
			"claude",
			"codex",
			"grok"
		];
		/** Human-facing name of each harness, used by cards, panels, and errors. */
		const HARNESS_LABELS = {
			claude: "Claude Code",
			codex: "Codex",
			grok: "Grok"
		};
		/** Narrow an untrusted model-supplied value to a known harness key. */
		function isHarnessKey(value) {
			return typeof value === "string" && HARNESS_KEYS.includes(value);
		}
		//#endregion
		//#region lib/shared/wire.js
		/**
		* The Typert Remote contract for `harnessCall`, owned by both halves at once.
		*
		* The host publishes invocation descriptors in its Typert manifest and the
		* browser mounts descriptors to build the client namespace; the two must match
		* field for field. They used to be two hand-written literals in two files, and
		* an edit to one silently broke the other at runtime only. Here they are ONE
		* constant: `src/host/wire.ts` embeds it in the host manifest, `src/client`
		* mounts it directly.
		*
		* Zero runtime dependencies — see the note in ./events.ts. That is what lets a
		* value (not just a type) be shared: the browser bundle can inline this module
		* without tripping the client-bundle purity gate, because it pulls in no
		* `@deepseek-ai` package at all. `src/host/wire.ts` statically proves the
		* constant conforms to the real `InvocationDescriptor` type.
		*
		* @module dsh-harness-call/shared/wire
		*/
		/** npm package name; the Typert contribution and bundle identity. */
		const PACKAGE_NAME = "dsh-harness-call";
		/** Cordis service key and Remote wire namespace. */
		const SERVICE_KEY = "harnessCall";
		/**
		* The contribution the browser mounts through `ctx.remote.$mount`. Structurally
		* a `TypertRemoteContribution`; typed nominally only on the host side.
		*/
		const HARNESS_CALL_CONTRIBUTION = {
			package: PACKAGE_NAME,
			descriptors: [{
				id: `${PACKAGE_NAME}#${SERVICE_KEY}/list`,
				service: SERVICE_KEY,
				namespace: SERVICE_KEY,
				method: "list",
				invocation: { kind: "direct" },
				parameters: [],
				result: { mode: "src-json" }
			}, {
				id: `${PACKAGE_NAME}#${SERVICE_KEY}/get`,
				service: SERVICE_KEY,
				namespace: SERVICE_KEY,
				method: "get",
				invocation: { kind: "direct" },
				parameters: [{
					name: "runId",
					wire: "runId",
					source: "json",
					codec: { mode: "src-json" }
				}, {
					name: "sinceSeq",
					wire: "sinceSeq",
					source: "json",
					codec: { mode: "src-json" }
				}],
				result: { mode: "src-json" }
			}]
		};
		//#endregion
		//#region \0dsh-css:/Users/caidongmeng/Documents/Github/dsh-plugin/dsh-harness-call/src/client/HarnessCall.module.css.mjs
		const css = ".cSbeta_card{border:1px solid color-mix(in srgb, currentColor 20%, transparent);cursor:pointer;border-radius:8px;margin:2px 0;padding:8px 10px;font-size:12px;line-height:1.55;transition:border-color .15s}.cSbeta_card:hover{border-color:color-mix(in srgb, currentColor 45%, transparent)}.cSbeta_head{align-items:center;gap:8px;font-weight:600;display:flex}.cSbeta_dot{flex:none}.cSbeta_label{text-overflow:ellipsis;white-space:nowrap;min-width:0;overflow:hidden}.cSbeta_status{opacity:.8;font-size:11px}.cSbeta_meta{opacity:.72;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.cSbeta_reply{-webkit-line-clamp:3;white-space:pre-wrap;-webkit-box-orient:vertical;margin-top:5px;display:-webkit-box;overflow:hidden}.cSbeta_promptExcerpt{opacity:.7;margin-top:2px;font-size:11px}.cSbeta_disclosure summary{cursor:pointer;opacity:.75;user-select:none;font-size:11px}.cSbeta_disclosureText{white-space:pre-wrap;max-height:320px;margin-top:4px;font-size:12px;overflow:auto}.cSbeta_pre{white-space:pre-wrap;word-break:break-word;opacity:.85;max-height:240px;margin:4px 0 0;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;overflow:auto}.cSbeta_panel{border:1px solid color-mix(in srgb, currentColor 18%, transparent);background:var(--dsw-alias-bg-base,canvas);width:min(420px,100% - 32px);min-height:0;max-height:min(60%,560px);box-shadow:0 8px 32px color-mix(in srgb, currentColor 22%, transparent);pointer-events:auto;animation:cSbeta_panelIn .16s var(--ds-ease-in-out,ease-out);border-radius:12px;flex-direction:column;font-size:13px;display:flex;position:absolute;bottom:16px;right:16px;overflow:hidden}@media (width<=720px){.cSbeta_panel{width:auto;max-height:52%;bottom:8px;left:8px;right:8px}}@keyframes cSbeta_panelIn{0%{opacity:0;transform:translateY(8px)}}@media (prefers-reduced-motion:reduce){.cSbeta_panel{animation:none}}.cSbeta_panel:focus-visible,.cSbeta_panelClose:focus-visible{outline:2px solid color-mix(in srgb, currentColor 55%, transparent);outline-offset:2px}.cSbeta_panelHead{border-bottom:1px solid color-mix(in srgb, currentColor 12%, transparent);flex:none;align-items:center;gap:8px;padding:12px 14px;font-weight:600;display:flex}.cSbeta_panelClose{color:inherit;opacity:.6;cursor:pointer;background:0 0;border:none;border-radius:6px;margin-left:auto;padding:4px 6px;font-size:13px}.cSbeta_panelClose:hover{opacity:1}.cSbeta_panelMeta{border-bottom:1px solid color-mix(in srgb, currentColor 12%, transparent);opacity:.72;word-break:break-all;flex:none;padding:8px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.cSbeta_panelBody{flex:1;min-height:0;padding:12px 14px;line-height:1.6;overflow:auto}.cSbeta_panelFoot{border-top:1px solid color-mix(in srgb, currentColor 12%, transparent);opacity:.72;flex:none;padding:8px 14px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.cSbeta_sectionLabel{opacity:.6;margin:12px 0 6px;font-size:11px;font-weight:600}.cSbeta_sectionLabel:first-child{margin-top:2px}.cSbeta_panelText{white-space:pre-wrap;word-break:break-word}.cSbeta_hint{opacity:.6}.cSbeta_prompt{border:1px dashed color-mix(in srgb, currentColor 25%, transparent);white-space:pre-wrap;opacity:.8;border-radius:8px;margin-top:6px;padding:8px 10px;font-size:12px}.cSbeta_notice{border-left:2px solid color-mix(in srgb, currentColor 45%, transparent);background:color-mix(in srgb, currentColor 7%, transparent);border-radius:0 6px 6px 0;margin-bottom:8px;padding:6px 8px;font-size:11px}.cSbeta_errors{border-left:2px solid color-mix(in srgb, currentColor 55%, transparent);background:color-mix(in srgb, currentColor 9%, transparent);white-space:pre-wrap;word-break:break-word;border-radius:0 6px 6px 0;padding:6px 8px;font-size:12px}.cSbeta_cardErrors{white-space:pre-wrap;opacity:.9;font-size:11px}.cSbeta_timeline{flex-direction:column;gap:6px;display:flex}.cSbeta_row{align-items:flex-start;gap:8px;font-size:12px;line-height:1.5;display:flex}.cSbeta_rowTime{text-align:right;opacity:.5;flex:none;width:38px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:10px}.cSbeta_rowBody{white-space:pre-wrap;word-break:break-word;flex:1;min-width:0}.cSbeta_reasoning{opacity:.72;font-style:italic}.cSbeta_note{opacity:.55;font-size:11px}.cSbeta_tool{opacity:.85;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}.cSbeta_toolName{font-weight:600}.cSbeta_toolExit{opacity:.7;margin-left:6px}.cSbeta_file{align-items:baseline;gap:6px;font-size:11px;display:flex}.cSbeta_fileChange{background:color-mix(in srgb, currentColor 14%, transparent);border-radius:4px;flex:none;padding:0 5px;font-size:10px}.cSbeta_filePath{word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}.cSbeta_rowError{border-left:2px solid color-mix(in srgb, currentColor 55%, transparent);background:color-mix(in srgb, currentColor 9%, transparent);border-radius:0 4px 4px 0;padding:2px 6px}";
		const tagId = "dsh-harness-call/HarnessCall.module.css";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-harness-call";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		var HarnessCall_module_css_default = {
			"card": "cSbeta_card",
			"cardErrors": "cSbeta_cardErrors",
			"disclosure": "cSbeta_disclosure",
			"disclosureText": "cSbeta_disclosureText",
			"dot": "cSbeta_dot",
			"errors": "cSbeta_errors",
			"file": "cSbeta_file",
			"fileChange": "cSbeta_fileChange",
			"filePath": "cSbeta_filePath",
			"head": "cSbeta_head",
			"hint": "cSbeta_hint",
			"label": "cSbeta_label",
			"meta": "cSbeta_meta",
			"note": "cSbeta_note",
			"notice": "cSbeta_notice",
			"panel": "cSbeta_panel",
			"panelBody": "cSbeta_panelBody",
			"panelClose": "cSbeta_panelClose",
			"panelFoot": "cSbeta_panelFoot",
			"panelHead": "cSbeta_panelHead",
			"panelIn": "cSbeta_panelIn",
			"panelMeta": "cSbeta_panelMeta",
			"panelText": "cSbeta_panelText",
			"pre": "cSbeta_pre",
			"prompt": "cSbeta_prompt",
			"promptExcerpt": "cSbeta_promptExcerpt",
			"reasoning": "cSbeta_reasoning",
			"reply": "cSbeta_reply",
			"row": "cSbeta_row",
			"rowBody": "cSbeta_rowBody",
			"rowError": "cSbeta_rowError",
			"rowTime": "cSbeta_rowTime",
			"sectionLabel": "cSbeta_sectionLabel",
			"status": "cSbeta_status",
			"timeline": "cSbeta_timeline",
			"tool": "cSbeta_tool",
			"toolExit": "cSbeta_toolExit",
			"toolName": "cSbeta_toolName"
		};
		//#endregion
		//#region lib/client/runs.js
		/**
		* Everything the two surfaces read from the host.
		*
		* Three pieces, one theme — the browser owns no run state of its own, it only
		* mirrors the host store:
		*
		* - {@link createRunFeed}: ONE roster poller for the whole page. Every live
		*   card needs the same `list()` answer, so a timer per card would multiply the
		*   same request by the number of running calls. The feed starts its timer with
		*   the first subscriber and stops it with the last, which also means a page
		*   with no unsettled card polls nothing at all.
		* - {@link useRunDetail}: the focused run's incremental timeline. The client
		*   accumulates events itself and passes the store's `cursor` back as the next
		*   `sinceSeq`, so a poll that produced nothing new costs one empty array.
		* - the block readers: a tool-call block is the only thing a card is handed,
		*   and both payloads inside it are text — streaming JSON arguments and the
		*   JSON the host rendered its return value into. The block's own shape is
		*   typed, those two payloads are not, so everything pulled out of them is
		*   narrowed here rather than trusted.
		*
		* @module dsh-harness-call/client/runs
		*/
		/**
		* Poll cadence of both the roster and the focused run. The host store is
		* in-memory and the payloads are small; the cost that matters is the number of
		* concurrent timers, which the shared feed already collapses to one.
		*/
		const POLL_MS = 2e3;
		/** Stable empty roster, so a never-polled feed keeps one snapshot identity. */
		const NO_RUNS = [];
		/**
		* Build the page's run feed over a live Remote namespace.
		*
		* @param resolve - reads the mounted namespace; it is `undefined` until the
		*   mount effect settles and again after unload, and the feed simply produces
		*   no updates in that window rather than holding a stale handle.
		* @returns the feed both the cards and the panel consume.
		*/
		function createRunFeed(resolve) {
			const listeners = /* @__PURE__ */ new Set();
			let snapshot = NO_RUNS;
			let timer;
			let inFlight = false;
			const poll = async () => {
				const api = resolve();
				if (api === void 0 || inFlight) return;
				inFlight = true;
				try {
					const outcome = await api.list();
					if (!outcome.ok) return;
					snapshot = outcome.value;
					for (const listener of [...listeners]) listener();
				} catch {} finally {
					inFlight = false;
				}
			};
			return {
				subscribe: (listener) => {
					listeners.add(listener);
					if (timer === void 0) {
						poll();
						timer = window.setInterval(() => {
							poll();
						}, POLL_MS);
					}
					return () => {
						listeners.delete(listener);
						if (listeners.size === 0 && timer !== void 0) {
							window.clearInterval(timer);
							timer = void 0;
						}
					};
				},
				getSnapshot: () => snapshot,
				detail: async (runId, sinceSeq) => {
					const api = resolve();
					if (api === void 0) return void 0;
					try {
						const outcome = await api.get(runId, sinceSeq);
						if (!outcome.ok) return void 0;
						return outcome.value ?? "unknown";
					} catch {
						return;
					}
				}
			};
		}
		/**
		* Read the shared roster, polling only while `active`.
		*
		* @param feed - the page feed.
		* @param active - whether this surface still needs live data; an inactive
		*   reader holds no subscription, so the shared timer stops with the last one.
		* @returns the roster snapshot.
		*/
		function useRoster(feed, active) {
			return (0, react.useSyncExternalStore)((0, react.useCallback)((listener) => active ? feed.subscribe(listener) : () => {}, [feed, active]), feed.getSnapshot);
		}
		/**
		* Locate a still-running card's run in the roster.
		*
		* Two of the three levels live here. The first — the `runId` the settled tool
		* result carries — needs no search and is read straight off the block by
		* {@link readResult}.
		*
		* ONLY CALL THIS FOR AN UNSETTLED CALL. The host store is plugin-global, so the
		* roster carries every run of every session, and the harness fallback is a
		* guess by construction. Two rules keep the guess from landing on someone
		* else's run: a settled call never guesses (it either carries a `runId` or has
		* no timeline to show), and a finished run is never a candidate — it is over,
		* so it belongs to some earlier call, never to one still waiting for its first
		* roster answer.
		*
		* @param runs - the roster, newest `startedAt` first.
		* @param callId - the tool call this card was rendered for.
		* @param harness - the harness the call named, when the arguments parsed.
		* @returns the matching run, or `undefined` while the host has none.
		*/
		function matchRun(runs, callId, harness) {
			const exact = runs.find((run) => run.callId === callId);
			if (exact !== void 0) return exact;
			return runs.find((run) => run.harness === harness && run.phase !== "done");
		}
		/**
		* Poll one run's timeline incrementally until nothing more can arrive.
		*
		* @param feed - the page feed.
		* @param runId - the focused run; `undefined` while it is still unresolved.
		* @param settled - whether the tool call itself has already produced a result.
		*   It is what makes an `'unknown'` answer terminal: for a call still in flight
		*   the host may simply not have opened the record yet, but for a settled one
		*   the run existed and the store has since forgotten it, so asking again is
		*   asking forever.
		* @returns the accumulated view, or `undefined` before the first answer.
		*/
		function useRunDetail(feed, runId, settled) {
			const [view, setView] = (0, react.useState)(void 0);
			/**
			* Nothing more will ever arrive for this run, so the timer stops. Derived
			* from the ANSWERS, not from the caller's snapshot of the click: a card that
			* was running when it was clicked keeps that shape forever, so anything read
			* off it would leave the poll running for as long as the panel is open.
			*/
			const [terminal, setTerminal] = (0, react.useState)(false);
			const cursor = (0, react.useRef)(0);
			const events = (0, react.useRef)([]);
			/**
			* Stands in for the AbortController a signal-less Remote cannot take: every
			* reset and every unmount bumps it, and a response from an older generation
			* is dropped instead of appended to the wrong run.
			*/
			const generation = (0, react.useRef)(0);
			(0, react.useEffect)(() => {
				cursor.current = 0;
				events.current = [];
				generation.current += 1;
				setView(void 0);
				setTerminal(false);
			}, [runId]);
			const load = (0, react.useCallback)(async () => {
				if (runId === void 0) return;
				const issued = generation.current;
				const detail = await feed.detail(runId, cursor.current);
				if (issued !== generation.current || detail === void 0) return;
				if (detail === "unknown") {
					if (settled) setTerminal(true);
					return;
				}
				cursor.current = detail.cursor;
				if (detail.events.length > 0) events.current = [...events.current, ...detail.events];
				if (detail.summary.phase === "done") setTerminal(true);
				setView({
					summary: detail.summary,
					events: events.current,
					text: detail.text
				});
			}, [
				feed,
				runId,
				settled
			]);
			(0, react.useEffect)(() => {
				if (runId === void 0 || terminal) return;
				load();
				const timer = window.setInterval(() => {
					load();
				}, POLL_MS);
				return () => {
					window.clearInterval(timer);
				};
			}, [
				load,
				runId,
				terminal
			]);
			(0, react.useEffect)(() => () => {
				generation.current += 1;
			}, []);
			return view;
		}
		function asRecord(value) {
			return typeof value === "object" && value !== null ? value : void 0;
		}
		function asText(value) {
			return typeof value === "string" && value.length > 0 ? value : void 0;
		}
		function asNumber(value) {
			return typeof value === "number" && Number.isFinite(value) ? value : void 0;
		}
		function asTexts(value) {
			if (!Array.isArray(value)) return [];
			const texts = [];
			for (const item of value) if (typeof item === "string" && item.length > 0) texts.push(item);
			return texts;
		}
		/**
		* Read the tool arguments off either block shape.
		*
		* `'kind' in block` is the discriminant the slot catalog prescribes: only the
		* settled {@link ToolResultNode} half of the union carries a `kind`, the running
		* call has none, so there is no field to compare.
		*
		* @param block - the block this card was rendered for.
		* @returns the two arguments the UI shows; both absent when the call head fell
		*   outside the conversation window.
		*/
		function readArgs(block) {
			const raw = "kind" in block ? block.call?.argsRaw : block.argsRaw;
			if (raw === void 0 || raw.length === 0) return {
				harness: void 0,
				prompt: void 0
			};
			let parsed;
			try {
				parsed = JSON.parse(raw);
			} catch {
				return {
					harness: void 0,
					prompt: void 0
				};
			}
			const args = asRecord(parsed);
			return {
				harness: asText(args?.harness),
				prompt: asText(args?.prompt)
			};
		}
		/**
		* Read the settled tool result.
		*
		* The host renders its JSON value into a single text content block, so the
		* result is recovered by parsing the first text block. Every field is narrowed
		* because the early-exit shapes in host/tool.ts carry only a subset.
		*
		* @param block - the block this card was rendered for.
		* @returns the result, or `undefined` while the call has not settled.
		*/
		function readResult(block) {
			if (!("kind" in block)) return void 0;
			let parsed;
			const content = Array.isArray(block.content) ? block.content : [];
			for (const item of content) {
				const entry = asRecord(item);
				if (entry?.type !== "text" || typeof entry.text !== "string") continue;
				try {
					parsed = JSON.parse(entry.text);
				} catch {
					return;
				}
				break;
			}
			const value = asRecord(parsed);
			if (value === void 0) return void 0;
			return {
				ok: value.ok === true,
				runId: asText(value.runId),
				label: asText(value.label),
				mode: asText(value.mode),
				sessionId: asText(value.sessionId),
				cwd: asText(value.cwd),
				elapsedMs: asNumber(value.elapsedMs),
				steps: asNumber(value.steps),
				costUsd: asNumber(value.costUsd),
				turns: asNumber(value.numTurns),
				errors: asTexts(value.errors),
				text: asText(value.text) ?? ""
			};
		}
		/** Whole seconds, the unit both surfaces show durations in. */
		function seconds(ms) {
			return Math.round(ms / 1e3);
		}
		/** Flatten any value onto one line, capped — the previews' only lossy step. */
		function brief(value, max) {
			const text = (typeof value === "string" ? value : JSON.stringify(value) ?? String(value)).replace(/\s+/g, " ").trim();
			return text.length > max ? `${text.slice(0, max)}…` : text;
		}
		//#endregion
		//#region lib/client/HarnessCallCard.js
		/** Cap of the prompt excerpt shown on a running card. */
		const PROMPT_EXCERPT_CHARACTERS = 140;
		/** How many failure reasons fit on a card before the panel should be opened. */
		const CARD_ERROR_LINES = 4;
		/** Human name of a harness, falling back to whatever the model actually asked for. */
		function harnessLabel(harness) {
			if (isHarnessKey(harness)) return HARNESS_LABELS[harness];
			return harness ?? "harness";
		}
		/** The live status line of a running call: how long, how much, doing what. */
		function liveStatus(summary, t) {
			const bits = [t("card.elapsed", { n: seconds(Date.now() - summary.startedAt) })];
			if (summary.eventCount > 0) bits.push(t("card.events", { n: summary.eventCount }));
			if (summary.lastEventKind !== void 0) bits.push(t("card.last", { type: t(`event.${summary.lastEventKind}`) }));
			return bits.join(" · ");
		}
		/** Keep a disclosure toggle from also opening the details panel. */
		function swallow(event) {
			event.stopPropagation();
		}
		/**
		* One tool-call card.
		*
		* @param props - the call identity and session the slot owner supplies, the
		*   running-or-settled block, the page run feed, bound translate, and the panel
		*   opener.
		* @returns the card tree.
		*/
		function HarnessCallCard(props) {
			const { callId, sessionId, block, feed, t, onOpen } = props;
			const settled = "kind" in block;
			const args = readArgs(block);
			const result = readResult(block);
			const runs = useRoster(feed, !settled);
			const summary = settled ? void 0 : matchRun(runs, callId, args.harness);
			const label = result?.label ?? summary?.label ?? harnessLabel(args.harness);
			const open = () => {
				onOpen({
					callId,
					sessionId,
					harness: args.harness ?? summary?.harness,
					label,
					prompt: args.prompt,
					result
				});
			};
			if (settled) {
				const ok = result?.ok === true;
				const text = result?.text ?? "";
				const errors = result?.errors ?? [];
				const head = [];
				if (result?.elapsedMs !== void 0) head.push(`${seconds(result.elapsedMs)}s`);
				if (result?.steps !== void 0) head.push(t("card.events", { n: result.steps }));
				return (0, react_jsx_runtime.jsxs)("div", {
					className: HarnessCall_module_css_default.card,
					title: t("card.openDone"),
					onClick: open,
					children: [
						(0, react_jsx_runtime.jsxs)("div", {
							className: HarnessCall_module_css_default.head,
							children: [
								(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
									state: ok ? "done" : "error",
									className: HarnessCall_module_css_default.dot
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: HarnessCall_module_css_default.label,
									children: label
								}),
								(0, react_jsx_runtime.jsx)("span", {
									className: HarnessCall_module_css_default.meta,
									children: head.join(" · ")
								})
							]
						}),
						ok && text.length > 0 && (0, react_jsx_runtime.jsx)("div", {
							className: HarnessCall_module_css_default.reply,
							children: text
						}),
						result?.sessionId !== void 0 && (0, react_jsx_runtime.jsx)("div", {
							className: HarnessCall_module_css_default.meta,
							children: `session ${result.sessionId} · ${t(result.mode === "resume" ? "card.sessionResume" : "card.sessionNew")}`
						}),
						errors.length > 0 && (0, react_jsx_runtime.jsx)("div", {
							className: HarnessCall_module_css_default.cardErrors,
							children: errors.slice(0, CARD_ERROR_LINES).join("\n")
						}),
						text.length > 0 && (0, react_jsx_runtime.jsx)("div", {
							onClick: swallow,
							children: (0, react_jsx_runtime.jsxs)("details", {
								className: HarnessCall_module_css_default.disclosure,
								children: [(0, react_jsx_runtime.jsx)("summary", { children: t("card.expandFull", { n: text.length }) }), (0, react_jsx_runtime.jsx)("div", {
									className: HarnessCall_module_css_default.disclosureText,
									children: text
								})]
							})
						})
					]
				});
			}
			const liveSession = summary?.sessionId;
			return (0, react_jsx_runtime.jsxs)("div", {
				className: HarnessCall_module_css_default.card,
				title: t("card.openRunning"),
				onClick: open,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: HarnessCall_module_css_default.head,
						children: [(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
							state: "ongoing",
							className: HarnessCall_module_css_default.dot
						}), (0, react_jsx_runtime.jsx)("span", {
							className: HarnessCall_module_css_default.label,
							children: `${label} · ${t("card.running")}`
						})]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: HarnessCall_module_css_default.status,
						children: summary === void 0 || summary.phase === "starting" ? t("card.starting") : liveStatus(summary, t)
					}),
					liveSession !== null && liveSession !== void 0 && (0, react_jsx_runtime.jsx)("div", {
						className: HarnessCall_module_css_default.meta,
						children: `session ${liveSession}`
					}),
					args.prompt !== void 0 && (0, react_jsx_runtime.jsx)("div", {
						className: HarnessCall_module_css_default.promptExcerpt,
						children: brief(args.prompt, PROMPT_EXCERPT_CHARACTERS)
					})
				]
			});
		}
		//#endregion
		//#region lib/client/HarnessPanel.js
		/**
		* The floating overlay panel: one run's full timeline and reply.
		*
		* This is where the normalized event union pays off. The model-facing tool
		* result flattens every event onto one 160-character line; here each kind keeps
		* its own shape — a tool call shows its name, exit code and (on demand) its
		* complete arguments, a file shows its path and what happened to it, reasoning
		* stays visibly secondary, errors get their own block, and accounting sits in
		* the footer. Events the host's ring buffer evicted are announced rather than
		* skipped, so a timeline that starts mid-run always says so.
		*
		* The panel is a `shell.overlay` entry, not a details-column occupant. That
		* layer is click-through, and this component renders exactly ONE box — the
		* panel itself — so it takes pointer events over its own area and nothing else:
		* there is deliberately no backdrop element to cover the app underneath.
		*
		* @module dsh-harness-call/client/HarnessPanel
		*/
		/** Cap of the one-line summary a collapsed tool-argument disclosure shows. */
		const INPUT_SUMMARY_CHARACTERS = 72;
		/** Format one reported cost for the accounting footer. */
		function cost(costUsd) {
			return `$${costUsd.toFixed(4)}`;
		}
		/**
		* Render one timeline event's body.
		*
		* @param event - the stored event.
		* @param t - bound translate.
		* @returns the body, or `null` for kinds the panel shows elsewhere.
		*/
		function eventBody(event, t) {
			switch (event.kind) {
				case "session": return (0, react_jsx_runtime.jsx)("span", {
					className: HarnessCall_module_css_default.note,
					children: `${t("event.session")} ${event.sessionId}`
				});
				case "reasoning": return (0, react_jsx_runtime.jsx)("span", {
					className: HarnessCall_module_css_default.reasoning,
					children: event.text
				});
				case "text": return event.text;
				case "tool": return (0, react_jsx_runtime.jsxs)("div", {
					className: HarnessCall_module_css_default.tool,
					children: [
						(0, react_jsx_runtime.jsx)("span", {
							className: HarnessCall_module_css_default.toolName,
							children: event.name
						}),
						event.exitCode !== void 0 && (0, react_jsx_runtime.jsx)("span", {
							className: HarnessCall_module_css_default.toolExit,
							children: t("event.exit", { code: event.exitCode })
						}),
						event.input !== void 0 && (0, react_jsx_runtime.jsxs)("details", {
							className: HarnessCall_module_css_default.disclosure,
							children: [(0, react_jsx_runtime.jsx)("summary", { children: `${t("event.input")} · ${brief(event.input, INPUT_SUMMARY_CHARACTERS)}` }), (0, react_jsx_runtime.jsx)("pre", {
								className: HarnessCall_module_css_default.pre,
								children: JSON.stringify(event.input, null, 2) ?? ""
							})]
						})
					]
				});
				case "file": return (0, react_jsx_runtime.jsxs)("span", {
					className: HarnessCall_module_css_default.file,
					children: [(0, react_jsx_runtime.jsx)("span", {
						className: HarnessCall_module_css_default.fileChange,
						children: t(`file.${event.change}`)
					}), (0, react_jsx_runtime.jsx)("span", {
						className: HarnessCall_module_css_default.filePath,
						children: event.path
					})]
				});
				case "error": return (0, react_jsx_runtime.jsx)("div", {
					className: HarnessCall_module_css_default.rowError,
					children: event.message
				});
				case "usage": return null;
				case "note": return (0, react_jsx_runtime.jsx)("span", {
					className: HarnessCall_module_css_default.note,
					children: event.text
				});
			}
		}
		/**
		* The floating panel for one harness run.
		*
		* @param props - the clicked target, the page run feed, bound translate, and
		*   the panel's own close action.
		* @returns the panel tree.
		*/
		function HarnessPanel(props) {
			const { target, feed, t, onClose } = props;
			const result = target.result;
			/**
			* Only an UNSETTLED target consults the roster. A settled one either carries
			* its own `runId` or never had a run at all (the early-exit results in
			* host/tool.ts report no run), and guessing from the roster there would attach
			* a stranger's complete timeline to this call's failure.
			*/
			const searching = result === void 0;
			/**
			* ...and it stops consulting it once the run it found is over. The roster is
			* the shared page poller: leaving this subscription open would keep the whole
			* page polling `list()` for as long as the panel stays open. Dropping it does
			* not lose the answer — the feed keeps its last snapshot, so `matchRun` still
			* resolves the same run on every later render.
			*/
			const [found, setFound] = (0, react.useState)(false);
			const runs = useRoster(feed, searching && !found);
			const run = searching ? matchRun(runs, target.callId, target.harness) : void 0;
			const view = useRunDetail(feed, result?.runId ?? run?.runId, result !== void 0);
			const summary = view?.summary;
			const phase = summary?.phase ?? run?.phase;
			(0, react.useEffect)(() => {
				if (phase === "done") setFound(true);
			}, [phase]);
			(0, react.useEffect)(() => {
				const onKey = (event) => {
					if (event.key === "Escape") onClose();
				};
				window.addEventListener("keydown", onKey);
				return () => {
					window.removeEventListener("keydown", onKey);
				};
			}, [onClose]);
			/**
			* Focus lands in the panel when it opens, so Tab reaches the close button and
			* the disclosures instead of continuing through the conversation behind it.
			*/
			const root = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				root.current?.focus();
			}, []);
			const done = summary === void 0 ? result !== void 0 : summary.phase === "done";
			const errors = summary !== void 0 && summary.errors.length > 0 ? summary.errors : result?.errors ?? [];
			const dot = errors.length > 0 || summary?.ok === false || result?.ok === false ? "error" : done ? "done" : "ongoing";
			const text = view !== void 0 && view.text.length > 0 ? view.text : result?.text ?? "";
			const elapsedMs = summary !== void 0 ? summary.elapsedMs ?? Date.now() - summary.startedAt : result?.elapsedMs;
			const mode = summary?.mode ?? result?.mode;
			const sessionId = summary?.sessionId ?? result?.sessionId;
			const meta = [];
			if (sessionId !== void 0) meta.push(`session ${sessionId}`);
			if (mode !== void 0) meta.push(t(mode === "resume" ? "panel.sessionResume" : "panel.sessionNew"));
			if (elapsedMs !== void 0) meta.push(`${seconds(elapsedMs)}s`);
			if (summary?.cwd !== void 0) meta.push(summary.cwd);
			else if (result?.cwd !== void 0) meta.push(result.cwd);
			const events = view?.events ?? [];
			const dropped = summary?.droppedEvents ?? 0;
			const costUsd = summary?.costUsd ?? result?.costUsd;
			const turns = summary?.turns ?? result?.turns;
			const accounting = [];
			if (costUsd !== void 0) accounting.push(cost(costUsd));
			if (turns !== void 0) accounting.push(t("panel.usageTurns", { turns }));
			const empty = events.length === 0 && text.length === 0 && errors.length === 0;
			const title = t("panel.title", { label: target.label });
			return (0, react_jsx_runtime.jsxs)("aside", {
				ref: root,
				className: HarnessCall_module_css_default.panel,
				role: "dialog",
				"aria-label": title,
				"aria-busy": done ? void 0 : true,
				tabIndex: -1,
				children: [
					(0, react_jsx_runtime.jsxs)("div", {
						className: HarnessCall_module_css_default.panelHead,
						children: [
							(0, react_jsx_runtime.jsx)(_deepseek_ai_dsh_client_ui_primitives.StateDot, {
								state: dot,
								className: HarnessCall_module_css_default.dot
							}),
							(0, react_jsx_runtime.jsx)("span", { children: title }),
							(0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: HarnessCall_module_css_default.panelClose,
								"aria-label": t("panel.close"),
								title: t("panel.close"),
								onClick: onClose,
								children: "✕"
							})
						]
					}),
					(0, react_jsx_runtime.jsx)("div", {
						className: HarnessCall_module_css_default.panelMeta,
						children: meta.length > 0 ? meta.join(" · ") : t("panel.waiting")
					}),
					(0, react_jsx_runtime.jsxs)("div", {
						className: HarnessCall_module_css_default.panelBody,
						children: [
							dropped > 0 && (0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.notice,
								children: t("panel.dropped", { n: dropped })
							}),
							events.length > 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.sectionLabel,
								children: t("panel.process", { n: events.length })
							}), (0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.timeline,
								children: events.map((event) => {
									const body = eventBody(event, t);
									if (body === null) return null;
									return (0, react_jsx_runtime.jsxs)("div", {
										className: HarnessCall_module_css_default.row,
										children: [(0, react_jsx_runtime.jsx)("span", {
											className: HarnessCall_module_css_default.rowTime,
											children: `${seconds(event.at)}s`
										}), (0, react_jsx_runtime.jsx)("div", {
											className: HarnessCall_module_css_default.rowBody,
											children: body
										})]
									}, event.seq);
								})
							})] }),
							errors.length > 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.sectionLabel,
								children: t("panel.errors")
							}), (0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.errors,
								children: errors.join("\n")
							})] }),
							text.length > 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.sectionLabel,
								children: t(done ? "panel.reply" : "panel.replyRunning")
							}), (0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.panelText,
								children: text
							})] }),
							empty && (0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.hint,
								children: t("panel.noOutput")
							}),
							!done && target.prompt !== void 0 && (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [(0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.sectionLabel,
								children: t("panel.prompt")
							}), (0, react_jsx_runtime.jsx)("div", {
								className: HarnessCall_module_css_default.prompt,
								children: target.prompt
							})] })
						]
					}),
					accounting.length > 0 && (0, react_jsx_runtime.jsx)("div", {
						className: HarnessCall_module_css_default.panelFoot,
						children: accounting.join(" · ")
					})
				]
			});
		}
		//#endregion
		//#region lib/client/locales.js
		/**
		* The browser half's copy, in the two locales the shell ships.
		*
		* `zh` is the authority: its keys ARE the namespace's dictionary union (see
		* ../client/contracts.ts), so `en` is typed against it and a key added to one
		* locale but not the other fails the build instead of silently falling back.
		*
		* @module dsh-harness-call/client/locales
		*/
		/** Locale namespace this half registers and binds. */
		const LOCALE_NS = "harness-call";
		/** The dictionaries in the shape `ctx.locale.register` takes. */
		const DICTIONARIES = {
			zh: {
				"cand.claude": "把这条消息委托给 Claude Code，自动续接其最近会话",
				"cand.codex": "把这条消息委托给 Codex CLI（默认只读沙箱），自动续接其最近会话",
				"cand.grok": "把这条消息委托给 Grok CLI，自动续接其最近会话",
				"card.starting": "启动中…",
				"card.running": "运行中",
				"card.elapsed": "{n}s",
				"card.events": "{n} 条事件",
				"card.last": "最近 {type}",
				"card.sessionNew": "新建",
				"card.sessionResume": "续接",
				"card.expandFull": "展开全文 · {n} 字符",
				"card.openDone": "点击查看完整过程与输出",
				"card.openRunning": "点击查看实时过程",
				"panel.title": "{label} · 过程与输出",
				"panel.close": "关闭面板（Esc）",
				"panel.sessionNew": "新会话",
				"panel.sessionResume": "续接会话",
				"panel.process": "过程 · {n} 条",
				"panel.dropped": "前 {n} 条事件已被丢弃，时间线从中途开始",
				"panel.reply": "回复",
				"panel.replyRunning": "回复（进行中）",
				"panel.errors": "错误",
				"panel.prompt": "发送的 prompt",
				"panel.noOutput": "暂无输出",
				"panel.waiting": "等待 harness 启动…",
				"panel.usageTurns": "{turns} 轮",
				"event.session": "会话",
				"event.reasoning": "思考",
				"event.text": "输出",
				"event.tool": "工具",
				"event.file": "文件",
				"event.error": "错误",
				"event.usage": "用量",
				"event.note": "备注",
				"event.exit": "退出码 {code}",
				"event.input": "参数",
				"file.create": "新建",
				"file.edit": "修改",
				"file.delete": "删除"
			},
			en: {
				"cand.claude": "Delegate this message to Claude Code; continues its latest session",
				"cand.codex": "Delegate this message to Codex CLI (read-only sandbox by default)",
				"cand.grok": "Delegate this message to Grok CLI; continues its latest session",
				"card.starting": "starting…",
				"card.running": "running",
				"card.elapsed": "{n}s",
				"card.events": "{n} events",
				"card.last": "last {type}",
				"card.sessionNew": "new",
				"card.sessionResume": "resumed",
				"card.expandFull": "Full text · {n} chars",
				"card.openDone": "Open the full process and output",
				"card.openRunning": "Open the live process",
				"panel.title": "{label} · process & output",
				"panel.close": "Close panel (Esc)",
				"panel.sessionNew": "new session",
				"panel.sessionResume": "resumed session",
				"panel.process": "Process · {n} events",
				"panel.dropped": "The first {n} events were discarded; this timeline starts mid-run",
				"panel.reply": "Reply",
				"panel.replyRunning": "Reply (in progress)",
				"panel.errors": "Errors",
				"panel.prompt": "Prompt sent",
				"panel.noOutput": "No output yet",
				"panel.waiting": "Waiting for the harness to start…",
				"panel.usageTurns": "{turns} turns",
				"event.session": "session",
				"event.reasoning": "thinking",
				"event.text": "text",
				"event.tool": "tool",
				"event.file": "file",
				"event.error": "error",
				"event.usage": "usage",
				"event.note": "note",
				"event.exit": "exit {code}",
				"event.input": "arguments",
				"file.create": "created",
				"file.edit": "edited",
				"file.delete": "deleted"
			}
		};
		//#endregion
		//#region lib/client/index.js
		/**
		* dsh-harness-call — browser half.
		*
		* Contributions:
		* - an `@` composer trigger source offering @claude / @codex / @grok;
		* - a `harness_call` tool card showing the live timeline while the external
		*   agent works, and its reply once it finishes;
		* - a floating `shell.overlay` panel with the full timeline and reply text.
		*
		* Everything it displays comes from the host's `harnessCall` Remote, mounted
		* from the descriptors in ../shared/wire.ts — the same constant the host
		* embeds in its Typert manifest, so the two faces cannot drift.
		*
		* @module dsh-harness-call/client
		*/
		/** The tool this half renders a card for; the keyed-slot cell. */
		const TOOL_NAME = "harness_call";
		/**
		* This half's cell in the frame-wide overlay list.
		*
		* `shell.overlay` is the additive seat for a surface of one's own: a fresh id
		* sits beside the shipped entries instead of replacing them. The details column
		* is NOT available for this — it is a single slot the conversation plugin
		* already occupies, and a second registration there either throws (killing this
		* plugin's whole `apply`) or shadows the shell's own tool details.
		*/
		const OVERLAY_ID = "dsh-harness-call/run";
		/**
		* Late in the list order. It only decides DOM order among overlay entries, and
		* this panel is a deliberate, dismissible surface: it belongs on top of the
		* ambient badges and pills that share the layer.
		*/
		const OVERLAY_ORDER = 100;
		/**
		* Drafts that are nothing but a mention. Enter on one of these is swallowed:
		* the question has not been typed yet, so Enter must neither send the bare tag
		* nor push the question onto its own line.
		*/
		const BARE_MENTIONS = new Set(HARNESS_KEYS.map((key) => `@${key}`));
		/** Required services; the fiber stays pending until every one is present. */
		const inject = [
			"slots",
			"inputTriggers",
			"locale",
			"remote"
		];
		function apply(ctx) {
			/**
			* The mounted Remote namespace. A closure binding rather than an effect local
			* because the cards and the panel render outside the mount effect and must
			* see it appear and disappear with the fiber, not hold a stale handle.
			*/
			let api;
			ctx.effect(async () => {
				const dispose = await ctx.remote.$mount(HARNESS_CALL_CONTRIBUTION);
				api = ctx.reflect.get(`remote.${SERVICE_KEY}`);
				if (api === void 0) throw new Error(`dsh-harness-call: the ${SERVICE_KEY} Remote namespace did not mount`);
				return () => {
					api = void 0;
					dispose();
				};
			}, "dsh-harness-call: remote");
			const feed = createRunFeed(() => api);
			ctx.effect(() => ctx.locale.register(LOCALE_NS, DICTIONARIES), "dsh-harness-call: dictionaries");
			const t = ctx.locale.bind(LOCALE_NS);
			/**
			* Which run the floating panel is showing, or `undefined` for closed. Closure
			* state shared by the cards (which write it) and the overlay entry (which
			* reads it) — the two live in different slots with no common React ancestor,
			* so a store beats prop drilling through the shell.
			*/
			const listeners = /* @__PURE__ */ new Set();
			let target;
			const subscribe = (listener) => {
				listeners.add(listener);
				return () => {
					listeners.delete(listener);
				};
			};
			const publish = (next) => {
				target = next;
				for (const listener of [...listeners]) listener();
			};
			const closePanel = () => {
				publish(void 0);
			};
			ctx.effect(() => ctx.inputTriggers.registerSource({
				trigger: "@",
				name: "harness",
				order: 10,
				async candidates(_session, req) {
					return HARNESS_KEYS.filter((key) => key.startsWith(req.query)).map((key) => ({
						name: key,
						description: t(`cand.${key}`)
					}));
				},
				onPick(pick) {
					return { text: `@${pick.candidate.name} ` };
				},
				async matchEnter(_session, line) {
					return BARE_MENTIONS.has(line.trim()) ? "handled" : void 0;
				},
				lexicon() {
					return HARNESS_KEYS;
				}
			}), "dsh-harness-call: @ trigger source");
			/**
			* The overlay occupant.
			*
			* The layer is root-scoped: it outlives every session switch, so this entry
			* does the session filtering the framework would otherwise have done. A target
			* belonging to another session is not merely hidden but DROPPED — navigating
			* away closes the panel for good, rather than resurrecting a stale run's
			* timeline on the way back.
			*
			* Keyed by `callId` so clicking a second card resets the panel's polling and
			* accumulation instead of grafting a new run onto the old one's state.
			*/
			function OverlayEntry(props) {
				const shown = (0, react.useSyncExternalStore)(subscribe, () => target);
				const session = props.useSessions((state) => state.current);
				const foreign = shown !== void 0 && shown.sessionId !== session;
				(0, react.useEffect)(() => {
					if (foreign) closePanel();
				}, [foreign]);
				if (shown === void 0 || foreign) return null;
				return (0, react_jsx_runtime.jsx)(HarnessPanel, {
					target: shown,
					feed,
					t,
					onClose: closePanel
				}, shown.callId);
			}
			ctx.slots.inject("shell.overlay", () => ctx.slots.register({
				name: "shell.overlay",
				id: OVERLAY_ID,
				order: OVERLAY_ORDER
			}, OverlayEntry));
			ctx.slots.inject("tool.call.toolview", () => ctx.slots.register({
				name: "tool.call.toolview",
				key: TOOL_NAME
			}, (props) => (0, react_jsx_runtime.jsx)(HarnessCallCard, {
				callId: props.callId,
				sessionId: props.sessionId,
				block: props.block,
				feed,
				t,
				onOpen: publish
			})));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});

//# sourceMappingURL=client.js.map