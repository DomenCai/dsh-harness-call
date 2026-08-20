/**
 * Pure run content: polling, process, reply, prompt. Knows nothing about
 * overlay chrome or the sidebar tab strip — those wrap this component and
 * pass `visible` so hidden surfaces stop polling.
 *
 * @module dsh-harness-call/client/HarnessRunView
 */

import { useEffect, useState, type ReactNode } from 'react'
import { MarkdownText, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StoredEvent } from '../shared/events.js'
import { legacyToolActivity, type ToolActivity } from './activities.js'
import type { HarnessTranslate } from './contracts.js'
import css from './HarnessCall.module.css'
import { ToolActivityCard } from './ToolActivityCard.js'
import {
  matchRun, seconds, useChannel, useRoster, useRunDetail,
  type RunFeed,
} from './runs.js'
import type { PanelTarget } from './runs.js'

/**
 * How long a surface keeps hunting the roster for its run before calling it
 * gone. Generous next to the 2s poll, because the only cost of waiting is a
 * later verdict — but bounded, because a sidebar tab restored from a host that
 * has since restarted would otherwise search an empty store forever.
 */
const SEARCH_GRACE_MS = 30000

/**
 * Slack allowed when comparing a run's `startedAt` against the click: the two
 * are stamped by DIFFERENT clocks (the host's and the browser's), which need
 * not agree. Wide enough that a skewed host does not hide its own runs,
 * narrow enough that runs from a later host generation stay excluded.
 */
const CLOCK_SKEW_MS = 60000

function cost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`
}

function tokenBit(label: string, value: number | undefined): string | undefined {
  if (value === undefined) return undefined
  return `${label} ${value.toLocaleString()}`
}

function eventBody(event: StoredEvent, t: HarnessTranslate, cwd: string | undefined): ReactNode {
  switch (event.kind) {
    case 'session':
      return <span className={css.note}>{`${t('event.session')} ${event.sessionId}`}</span>
    case 'reasoning':
      return <span className={css.reasoning}>{event.text}</span>
    case 'text':
      return event.text
    case 'tool':
      return <ToolActivityCard activity={legacyToolActivity(event)} t={t} cwd={cwd} />
    case 'tool_start':
    case 'tool_finish':
    case 'usage':
      return null
    case 'file':
      return (
        <span className={css.file}>
          <span className={css.fileChange}>{t(`file.${event.change}`)}</span>
          <span className={css.filePath}>{event.path}</span>
        </span>
      )
    case 'error':
      return <div className={css.rowError}>{event.message}</div>
    case 'note':
      return <span className={css.note}>{event.text}</span>
  }
}

export function HarnessRunView(props: {
  target: PanelTarget
  feed: RunFeed
  t: HarnessTranslate
  visible?: boolean
  /** Overlay already draws a title row; skip the inner one. */
  embedded?: boolean
}): ReactNode {
  const { target, feed, t, visible = true, embedded = false } = props
  const result = target.result
  /** The roster's answer, once it has one. Only ever set from a candidate. */
  const [foundRunId, setFoundRunId] = useState<string | undefined>(undefined)
  /** The search is over and it failed: the store does not hold this run. */
  const [gaveUp, setGaveUp] = useState(false)
  const runId = target.runId ?? foundRunId
  const searching = runId === undefined
  const [processOpen, setProcessOpen] = useState(result === undefined)
  const rosterActive = visible && searching && !gaveUp
  const runs = useRoster(feed, rosterActive)
  const channel = useChannel(feed, rosterActive)
  // A run that started AFTER the click cannot be the one this target names.
  // Without that bound, the harness fallback inside matchRun would hand a tab
  // restored from a dead host whatever happens to be running now.
  const candidate = searching
    ? matchRun(runs, target.callId, target.harness, target.openedAt + CLOCK_SKEW_MS)
    : undefined
  // Only a runId the target CARRIES is authoritative; one matched out of the
  // roster is by definition still in the store.
  const { view, missing } = useRunDetail(feed, runId, target.runId !== undefined, visible)

  useEffect(() => {
    if (candidate !== undefined) {
      setFoundRunId(candidate.runId)
      return
    }
    if (!rosterActive) return
    const remaining = target.openedAt + SEARCH_GRACE_MS - Date.now()
    if (remaining <= 0) {
      setGaveUp(true)
      return
    }
    const timer = window.setTimeout(() => { setGaveUp(true) }, remaining)
    return () => { window.clearTimeout(timer) }
  }, [candidate, rosterActive, target.openedAt])

  const summary = view?.summary
  const done = summary === undefined ? result !== undefined : summary.phase === 'done'
  const errors = summary !== undefined && summary.errors.length > 0
    ? summary.errors
    : result?.errors ?? []
  const failed = errors.length > 0 || summary?.ok === false || result?.ok === false
  const dot: StateDotState = failed ? 'error' : done ? 'done' : 'ongoing'
  const text = view !== undefined && view.text.length > 0 ? view.text : result?.text ?? ''

  const elapsedMs = summary !== undefined
    ? summary.elapsedMs ?? Date.now() - summary.startedAt
    : result?.elapsedMs
  const mode = summary?.mode ?? result?.mode
  const sessionId = summary?.sessionId ?? result?.sessionId
  const cwd = summary?.cwd ?? result?.cwd
  const metaPrimary: string[] = []
  if (mode !== undefined) metaPrimary.push(t(mode === 'resume' ? 'panel.sessionResume' : 'panel.sessionNew'))
  if (elapsedMs !== undefined) metaPrimary.push(`${seconds(elapsedMs)}s`)
  const costUsd = summary?.costUsd ?? result?.costUsd
  const turns = summary?.turns ?? result?.turns
  if (costUsd !== undefined) metaPrimary.push(cost(costUsd))
  if (turns !== undefined) metaPrimary.push(t('panel.usageTurns', { turns }))

  const events = view?.events ?? []
  const activities = view?.activities
  const dropped = summary?.droppedEvents ?? 0
  const tools = activities?.tools ?? []
  const orphans = activities?.orphans ?? []
  const processCount = tools.length + orphans.length + events.filter(event => {
    return event.kind !== 'tool_start' && event.kind !== 'tool_finish' && event.kind !== 'usage'
  }).length

  const accounting: string[] = []
  const model = summary?.model
  if (model !== undefined) accounting.push(model)
  const inputTokens = tokenBit(t('panel.tokensIn'), summary?.inputTokens)
  const outputTokens = tokenBit(t('panel.tokensOut'), summary?.outputTokens)
  const cachedTokens = tokenBit(t('panel.tokensCached'), summary?.cachedTokens)
  const reasoningTokens = tokenBit(t('panel.tokensReason'), summary?.reasoningTokens)
  for (const bit of [inputTokens, outputTokens, cachedTokens, reasoningTokens]) {
    if (bit !== undefined) accounting.push(bit)
  }

  const empty = events.length === 0 && text.length === 0 && errors.length === 0
  // Two ways to learn the same thing: the store answered "no such run", or the
  // search for one ran out of grace.
  const runExpired = missing || gaveUp
  const stderrTail = result?.stderrTail ?? []
  const headline = metaPrimary.length > 0
    ? metaPrimary.join(' · ')
    : runExpired
      ? ''
      : searching && channel.error !== undefined
        ? t('panel.channelDown')
        : t('panel.waiting')

  return (
    <div className={css.runView}>
      <div className={css.runHead}>
        <StateDot state={dot} className={css.dot} />
        <div className={css.runHeadText}>
          {!embedded && <div className={css.runTitle}>{t('panel.title', { label: target.label })}</div>}
          {headline.length > 0 && <div className={css.runMetaPrimary}>{headline}</div>}
          {sessionId !== undefined && sessionId !== null && (
            <div className={css.runMetaSecondary}>{`session ${sessionId}`}</div>
          )}
          {cwd !== undefined && <div className={css.runMetaSecondary}>{cwd}</div>}
        </div>
      </div>
      <div className={css.runBody}>
        {runExpired && <div className={css.notice}>{t('panel.expired')}</div>}
        {searching && channel.error !== undefined && (
          <div className={css.rowError}>{channel.error}</div>
        )}
        {dropped > 0 && <div className={css.notice}>{t('panel.dropped', { n: dropped })}</div>}
        {orphans.length > 0 && (
          <div className={css.notice}>{t('activity.orphans', { n: orphans.length })}</div>
        )}
        {(tools.length > 0 || orphans.length > 0 || events.length > 0) && (
          <details
            className={css.process}
            open={processOpen}
            onToggle={(event) => { setProcessOpen(event.currentTarget.open) }}
          >
            <summary className={css.sectionLabel}>{t('panel.process', { n: processCount })}</summary>
            <ProcessTimeline
              events={events}
              tools={tools}
              orphans={orphans}
              t={t}
              cwd={cwd}
            />
          </details>
        )}
        {errors.length > 0 && (
          <>
            <div className={css.sectionLabel}>{t('panel.errors')}</div>
            <div className={css.errors}>{errors.join('\n')}</div>
          </>
        )}
        {stderrTail.length > 0 && (
          <>
            <div className={css.sectionLabel}>{t('panel.stderr')}</div>
            <pre className={css.pre}>{stderrTail.join('\n')}</pre>
          </>
        )}
        {text.length > 0 && (
          <>
            <div className={css.sectionLabel}>{t(done ? 'panel.reply' : 'panel.replyRunning')}</div>
            {/* No wrapper: MarkdownText emits real newline text nodes between
                its blocks, so any inherited `white-space: pre-wrap` turns every
                block boundary into a blank line. */}
            <MarkdownText text={text} streaming={!done} />
          </>
        )}
        {empty && !runExpired && <div className={css.hint}>{t('panel.noOutput')}</div>}
        {target.prompt !== undefined && (
          <>
            <div className={css.sectionLabel}>{t('panel.prompt')}</div>
            <div className={css.prompt}>{target.prompt}</div>
          </>
        )}
      </div>
      {accounting.length > 0 && <div className={css.panelFoot}>{accounting.join(' · ')}</div>}
    </div>
  )
}

function ProcessTimeline(props: {
  events: readonly StoredEvent[]
  tools: ToolActivity[]
  orphans: ToolActivity[]
  t: HarnessTranslate
  cwd: string | undefined
}): ReactNode {
  const { events, tools, orphans, t, cwd } = props
  const byStart = new Map(tools.map(tool => [tool.startSeq, tool]))
  const byFinish = new Map(orphans.map(orphan => [orphan.finishSeq, orphan]))
  const rows: ReactNode[] = []
  const toolRow = (activity: ToolActivity, at: number, key: string): ReactNode => (
    <div key={key} className={css.row}>
      <span className={css.rowTime}>{`${seconds(at)}s`}</span>
      <div className={css.rowBody}><ToolActivityCard activity={activity} t={t} cwd={cwd} /></div>
    </div>
  )
  for (const event of events) {
    if (event.kind === 'tool_start') {
      const activity = byStart.get(event.seq)
      if (activity === undefined) continue
      rows.push(toolRow(activity, event.at, `tool:${activity.callId}`))
      continue
    }
    if (event.kind === 'tool_finish') {
      // A paired finish already has a card, anchored where its start was, so
      // it draws nothing here. An orphan has no other place to appear — and it
      // belongs at ITS OWN seq, not appended after every later event.
      const orphan = byFinish.get(event.seq)
      if (orphan === undefined) continue
      rows.push(toolRow(orphan, event.at, `orphan:${orphan.callId}`))
      continue
    }
    if (event.kind === 'usage') continue
    const body = eventBody(event, t, cwd)
    if (body === null) continue
    rows.push(
      <div key={event.seq} className={css.row}>
        <span className={css.rowTime}>{`${seconds(event.at)}s`}</span>
        <div className={css.rowBody}>{body}</div>
      </div>,
    )
  }
  return <div className={css.timeline}>{rows}</div>
}
