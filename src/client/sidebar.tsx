/**
 * Optional Better Sidebar integration: register a hidden run tab and route
 * every card click into it. The floating panel is the fallback for one case
 * only — Better Sidebar is absent or too old to take the open.
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
  TabComponentProps,
} from './contracts.js'
import { HarnessRunView } from './HarnessRunView.js'
import type { HarnessResult, PanelTarget, RunFeed } from './runs.js'

export const RUN_TAB_TYPE = 'dsh-harness-call:run'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
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

/** Open the run in a sidebar tab; `false` means Better Sidebar cannot take it. */
export function tryOpenSidebarTab(ctx: ClientContext, target: PanelTarget, t: HarnessTranslate): boolean {
  const sidebar = ctx.get('betterSidebar')
  if (sidebar === undefined) return false
  if (!hasFeature(sidebar, 'targetedOpen') || !hasFeature(sidebar, 'tabMeta')) return false
  if (sidebar.getTab(RUN_TAB_TYPE) === undefined) return false
  sidebar.openTab(
    {
      type: RUN_TAB_TYPE,
      id: `harness-run-${target.callId}`,
      title: t('sidebar.run'),
      // A collapsed panel does not reveal itself for a type-only open: Better
      // Sidebar expands the landing panel for CONTENT opens only, and it
      // recognizes those by the seed carrying a path. A run is content — it
      // just is not a file, so the handle stands in for one. Nothing reads it
      // back: the tab renders from `meta`, and the sidebar only carries and
      // persists `path`.
      path: `harness-run:${target.runId ?? target.callId}`,
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
