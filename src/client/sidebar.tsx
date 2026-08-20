/**
 * Optional Better Sidebar integration: register a hidden run tab and route
 * card clicks into it when the panel is currently visible. Overlay remains
 * the fallback when the service is missing, too old, or the workbench is
 * collapsed (type-only openTab does not reveal a folded panel).
 *
 * Runtime collaboration is through ctx.get / ctx.inject. Types are restated
 * in ./contracts.ts so this file never value-imports the sidebar package.
 *
 * @module dsh-harness-call/client/sidebar
 */

import type { ReactNode } from 'react'
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type {
  BetterSidebarService,
  HarnessTranslate,
  SidebarSnapshot,
  TabComponentProps,
} from './contracts.js'
import { HarnessRunView } from './HarnessRunView.js'
import type { HarnessResult, PanelTarget, RunFeed } from './runs.js'

export const RUN_TAB_TYPE = 'dsh-harness-call:run'

const NARROW_MAX_WIDTH = 768

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function treeHasId(node: unknown, id: string): boolean {
  if (!isRecord(node)) return false
  if (node.id === id) return true
  const children = node.children
  if (!Array.isArray(children)) return false
  return children.some(child => treeHasId(child, id))
}

function sidebarVisible(snapshot: SidebarSnapshot): boolean {
  const state = snapshot.state
  if (state === undefined) return false
  const narrow = typeof window !== 'undefined' && window.innerWidth < NARROW_MAX_WIDTH
  if (narrow) return state.panelOpen
  const pane = state.activePane
  if (typeof pane === 'string' && treeHasId(state.bottomSplits, pane)) return state.bottomOpen
  return state.panelOpen
}

function hasFeature(service: BetterSidebarService, name: string): boolean {
  return service.features.includes(name)
}

function asText(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function asTexts(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return []
  const texts: string[] = []
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0) texts.push(item)
  }
  return texts
}

function readStoredResult(value: unknown): HarnessResult | undefined {
  if (!isRecord(value)) return undefined
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
    turns: asNumber(value.turns) ?? asNumber(value.numTurns),
    errors: asTexts(value.errors),
    stderrTail: asTexts(value.stderrTail),
    text: asText(value.text) ?? '',
  }
}

function readMeta(meta: unknown): PanelTarget | undefined {
  if (!isRecord(meta)) return undefined
  const callId = asText(meta.callId)
  const sessionId = asText(meta.sessionId)
  const label = asText(meta.label)
  if (callId === undefined || sessionId === undefined || label === undefined) return undefined
  return {
    callId,
    sessionId: sessionId as SessionId,
    harness: asText(meta.harness),
    label,
    prompt: asText(meta.prompt),
    runId: asText(meta.runId),
    // A tab persisted before this field existed is by definition from an
    // earlier host: 0 puts it straight past the search grace period.
    openedAt: asNumber(meta.openedAt) ?? 0,
    result: readStoredResult(meta.result),
  }
}

/** Open the run in a sidebar tab when the workbench is in sight; otherwise false. */
export function tryOpenSidebarTab(ctx: ClientContext, target: PanelTarget, t: HarnessTranslate): boolean {
  const sidebar = ctx.get('betterSidebar')
  if (sidebar === undefined) return false
  if (!hasFeature(sidebar, 'targetedOpen') || !hasFeature(sidebar, 'tabMeta')) return false
  if (sidebar.getTab(RUN_TAB_TYPE) === undefined) return false
  if (!sidebarVisible(sidebar.getSnapshot())) return false
  sidebar.openTab(
    {
      type: RUN_TAB_TYPE,
      id: `harness-run-${target.callId}`,
      title: t('sidebar.run'),
      meta: {
        callId: target.callId,
        runId: target.runId,
        openedAt: target.openedAt,
        harness: target.harness,
        label: target.label,
        prompt: target.prompt,
        result: target.result,
        sessionId: target.sessionId,
      },
    },
    { sessionId: target.sessionId },
  )
  return true
}

/** Register the hidden run tab on a fiber that only exists while Better Sidebar does. */
export function registerRunTab(ctx: ClientContext, feed: RunFeed, t: HarnessTranslate): void {
  ctx.inject(['betterSidebar'], (sidebarCtx) => {
    sidebarCtx.effect(() => sidebarCtx.betterSidebar.registerTab({
      id: RUN_TAB_TYPE,
      title: () => t('sidebar.run'),
      order: 55,
      hidden: true,
      dedupeKey: (tab) => {
        if (!isRecord(tab.meta)) return tab.id
        const runId = tab.meta.runId
        return typeof runId === 'string' && runId.length > 0 ? runId : tab.id
      },
      component: (props: TabComponentProps): ReactNode => {
        const target = readMeta(props.tab.meta)
        if (target === undefined) return null
        return <HarnessRunView target={target} feed={feed} t={t} visible={props.visible} />
      },
    }), 'dsh-harness-call: better-sidebar run tab')
  })
}
