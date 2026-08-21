/** Chronological run transcript for cards and sidebar panels. */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { MarkdownText, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { StoredEvent } from '../shared/events.js'
import type { ToolActivity } from './activities.js'
import type { HarnessTranslate } from './contracts.js'
import css from './HarnessCall.module.css'
import { ToolActivityCard } from './ToolActivityCard.js'
import { matchRun, seconds, useChannel, useRoster, useRunDetail, type RunFeed } from './runs.js'
import type { PanelTarget } from './runs.js'
import { buildSegments, displaySegmentText, shouldAutoOpenTail, type ProcessRow, type TranscriptSegment } from './segments.js'

const SEARCH_GRACE_MS = 30000
const CLOCK_SKEW_MS = 60000

function cost(costUsd: number): string {
  return '$' + costUsd.toFixed(4)
}

function tokenBit(label: string, value: number | undefined): string | undefined {
  return value === undefined ? undefined : label + ' ' + value.toLocaleString()
}

function eventBody(event: StoredEvent, t: HarnessTranslate): ReactNode {
  switch (event.kind) {
    case 'session':
      return <span className={css.note}>{t('event.session') + ' ' + event.sessionId}</span>
    case 'reasoning':
      return <span className={css.reasoning}>{event.text}</span>
    case 'text':
    case 'tool_start':
    case 'tool_finish':
    case 'usage':
      return null
    case 'file':
      return (
        <span className={css.file}>
          <span className={css.fileChange}>{t(event.change === 'create' ? 'file.create' : event.change === 'edit' ? 'file.edit' : 'file.delete')}</span>
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
  embedded?: boolean
}): ReactNode {
  const { target, feed, t, visible = true, embedded = false } = props
  const result = target.result
  const [foundRunId, setFoundRunId] = useState<string | undefined>(undefined)
  const [gaveUp, setGaveUp] = useState(false)
  const runId = target.runId ?? foundRunId
  const searching = runId === undefined
  const rosterActive = visible && searching && !gaveUp
  const runs = useRoster(feed, rosterActive)
  const channel = useChannel(feed, rosterActive)
  const candidate = searching
    ? matchRun(runs, target.callId, target.harness, target.openedAt + CLOCK_SKEW_MS)
    : undefined
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
  const errors = summary !== undefined && summary.errors.length > 0 ? summary.errors : result?.errors ?? []
  const failed = errors.length > 0 || summary?.ok === false || result?.ok === false
  const dot: StateDotState = failed ? 'error' : done ? 'done' : 'ongoing'
  const text = view?.text ?? result?.text ?? ''
  const elapsedMs = summary !== undefined ? summary.elapsedMs ?? Date.now() - summary.startedAt : result?.elapsedMs
  const mode = summary?.mode ?? result?.mode
  const sessionId = summary !== undefined ? summary.sessionId : result?.sessionId
  const cwd = summary?.cwd
  const metaPrimary: string[] = []
  if (mode !== undefined) metaPrimary.push(t(mode === 'resume' ? 'panel.sessionResume' : 'panel.sessionNew'))
  if (elapsedMs !== undefined) metaPrimary.push(seconds(elapsedMs) + 's')
  const costUsd = summary?.costUsd ?? result?.costUsd
  const turns = summary?.turns ?? result?.turns
  if (costUsd !== undefined) metaPrimary.push(cost(costUsd))
  if (turns !== undefined) metaPrimary.push(t('panel.usageTurns', { turns }))

  const events = view?.events ?? []
  const activities = view?.activities
  const dropped = summary?.droppedEvents ?? 0
  const tools = activities?.tools ?? []
  const orphans = activities?.orphans ?? []
  const segments = buildSegments(events, tools, orphans)
  const hasTranscriptText = segments.some(segment => segment.kind === 'text')
  const runExpired = missing || gaveUp
  const showAuthoritative = text.length > 0 && (
    dropped > 0 || (view !== undefined && !hasTranscriptText) || runExpired
  )

  const accounting: string[] = []
  if (summary?.model !== undefined) accounting.push(summary.model)
  for (const bit of [
    tokenBit(t('panel.tokensIn'), summary?.inputTokens),
    tokenBit(t('panel.tokensOut'), summary?.outputTokens),
    tokenBit(t('panel.tokensCached'), summary?.cachedTokens),
    tokenBit(t('panel.tokensReason'), summary?.reasoningTokens),
  ]) if (bit !== undefined) accounting.push(bit)

  const stderrTail = result?.stderrTail ?? []
  const empty = segments.length === 0 && text.length === 0 && errors.length === 0
  const headline = metaPrimary.length > 0
    ? metaPrimary.join(' · ')
    : runExpired
      ? ''
      : searching && channel.error !== undefined
        ? t('panel.channelDown')
        : t('panel.waiting')

  const [promptExpanded, setPromptExpanded] = useState(false)
  const [autoOpened, setAutoOpened] = useState<Set<number>>(() => new Set())
  const [manual, setManual] = useState<Map<number, boolean>>(() => new Map())
  const sawLive = useRef(false)
  const lastSegment = segments[segments.length - 1]
  const promptExpandable = target.prompt !== undefined
    && (target.prompt.length > 240 || target.prompt.split('\n').length > 4)

  useEffect(() => {
    setPromptExpanded(false)
    setAutoOpened(new Set())
    setManual(new Map())
    sawLive.current = false
  }, [runId, target.callId])

  useEffect(() => {
    if (!done) sawLive.current = true
    if (!shouldAutoOpenTail(done, sawLive.current, lastSegment?.kind) || lastSegment?.kind !== 'process') return
    setAutoOpened(current => {
      if (current.has(lastSegment.seq)) return current
      const next = new Set(current)
      next.add(lastSegment.seq)
      return next
    })
  }, [done, lastSegment?.kind, lastSegment?.seq])

  return (
    <div className={css.runView}>
      <div className={css.runHead}>
        <StateDot state={dot} className={css.dot} />
        <div className={css.runHeadText}>
          {!embedded && <div className={css.runTitle}>{t('panel.title', { label: target.label })}</div>}
          {headline.length > 0 && <div className={css.runMetaPrimary}>{headline}</div>}
          {summary?.sessionId === null ? (
            <div className={css.runMetaSecondary}>{t('panel.sessionPending')}</div>
          ) : sessionId !== undefined && sessionId !== null ? (
            <div className={css.runMetaSecondary}>{'session ' + sessionId}</div>
          ) : null}
          {cwd !== undefined && <div className={css.runMetaSecondary}>{cwd}</div>}
        </div>
      </div>
      <div className={css.runBody}>
        {errors.length > 0 && (
          <>
            <div className={css.sectionLabel}>{t('panel.errors')}</div>
            <div className={css.errors}>{errors.join('\n')}</div>
          </>
        )}
        {runExpired && <div className={css.notice}>{t('panel.expired')}</div>}
        {searching && channel.error !== undefined && <div className={css.rowError}>{channel.error}</div>}
        {dropped > 0 && <div className={css.notice}>{t('panel.dropped', { n: dropped })}</div>}
        {orphans.length > 0 && <div className={css.notice}>{t('activity.orphans', { n: orphans.length })}</div>}
        {target.prompt !== undefined && (
          <section className={css.promptSection}>
            <div className={css.promptHead}>
              <div className={css.sectionLabel}>{t('panel.prompt')}</div>
              {promptExpandable && (
                <button className={css.promptToggle} type="button" onClick={() => { setPromptExpanded(value => !value) }}>
                  {t(promptExpanded ? 'panel.promptCollapse' : 'panel.promptExpand')}
                </button>
              )}
            </div>
            <div className={promptExpanded || !promptExpandable ? css.prompt : css.prompt + ' ' + css.promptCollapsed}>{target.prompt}</div>
          </section>
        )}
        {segments.length > 0 && (
          <div className={css.transcript}>
            {segments.map((segment, index) => {
              if (segment.kind === 'text') {
                return (
                  <div key={'text:' + segment.seq} className={css.transcriptText}>
                    <MarkdownText text={displaySegmentText(segment)} streaming={segment.last && !done} />
                  </div>
                )
              }
              const isLast = index === segments.length - 1
              const manuallyOpen = manual.get(segment.seq)
              const open = manuallyOpen ?? (autoOpened.has(segment.seq) && isLast)
              return (
                <ProcessSegment
                  key={'process:' + segment.seq}
                  segment={segment}
                  open={open}
                  t={t}
                  cwd={cwd}
                  onToggle={() => {
                    setManual(current => {
                      const next = new Map(current)
                      next.set(segment.seq, !open)
                      return next
                    })
                  }}
                />
              )
            })}
          </div>
        )}
        {showAuthoritative && (
          <section className={css.authoritativeReply}>
            <div className={css.sectionLabel}>{t('panel.replyAuthoritative')}</div>
            <MarkdownText text={text} streaming={false} />
          </section>
        )}
        {stderrTail.length > 0 && (
          <details className={css.process}>
            <summary className={css.sectionLabel}>{t('panel.stderr')}</summary>
            <pre className={css.pre}>{stderrTail.join('\n')}</pre>
          </details>
        )}
        {empty && !runExpired && <div className={css.hint}>{t('panel.noOutput')}</div>}
      </div>
      {accounting.length > 0 && <div className={css.panelFoot}>{accounting.join(' · ')}</div>}
    </div>
  )
}

function ProcessSegment(props: {
  segment: Extract<TranscriptSegment, { kind: 'process' }>
  open: boolean
  t: HarnessTranslate
  cwd: string | undefined
  onToggle: () => void
}): ReactNode {
  const { segment, open, t, cwd, onToggle } = props
  return (
    <details className={css.process} open={open}>
      <summary
        className={css.sectionLabel}
        onClick={(event) => {
          event.preventDefault()
          onToggle()
        }}
      >
        {t('panel.segment', { n: segment.rows.length })}
      </summary>
      <div className={css.timeline}>
        {segment.rows.map(row => <ProcessRowView key={'row:' + row.seq} row={row} t={t} cwd={cwd} />)}
      </div>
    </details>
  )
}

function ProcessRowView(props: { row: ProcessRow, t: HarnessTranslate, cwd: string | undefined }): ReactNode {
  const { row, t, cwd } = props
  const body = row.kind === 'tool'
    ? <ToolActivityCard activity={row.activity as ToolActivity} t={t} cwd={cwd} />
    : eventBody(row.event, t)
  if (body === null) return null
  return (
    <div className={css.row}>
      <span className={css.rowTime}>{seconds(row.at) + 's'}</span>
      <div className={css.rowBody}>{body}</div>
    </div>
  )
}
