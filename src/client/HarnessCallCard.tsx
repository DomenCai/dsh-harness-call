/**
 * The `harness_call` tool card.
 *
 * Three states, one component. While the call is in flight the card is the only
 * window into a process that runs for minutes: it names the harness, counts the
 * events the host has recorded, says what the external agent is doing right now,
 * and shows the prompt the model composed. When the host run is already `done`
 * but DSH has not yet written the tool-result block, the same roster row shows
 * a frozen complete state without the reply. Once the call settles the card
 * becomes a result: reply preview, session identity, and the full text behind a
 * disclosure. Either way, clicking it opens the floating run panel.
 *
 * The card reads ONLY the roster (`list`), never a timeline — a page with six
 * live calls costs one small request every couple of seconds, because all six
 * share one poller.
 *
 * @module dsh-harness-call/client/HarnessCallCard
 */

import type { KeyboardEvent, MouseEvent, ReactNode } from 'react'
import { StateDot } from '@deepseek-ai/dsh-client-ui-primitives'
import type { ClientContext, SessionId, ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { RunSummary } from '../shared/events.js'
import { HARNESS_LABELS, isHarnessKey } from '../shared/harness.js'
import type { HarnessTranslate } from './contracts.js'
import css from './HarnessCall.module.css'
import { brief, matchRun, readArgs, readResult, seconds, unsettledCardState, useChannel, useRoster, type PanelTarget, type RunFeed } from './runs.js'
import { tryOpenSidebarTab } from './sidebar.js'

/** Cap of the prompt excerpt shown on a running card. */
const PROMPT_EXCERPT_CHARACTERS = 140
/** How many failure reasons fit on a card before the panel should be opened. */
const CARD_ERROR_LINES = 4

/** Human name of a harness, falling back to whatever the model actually asked for. */
function harnessLabel(harness: string | undefined): string {
  if (isHarnessKey(harness)) return HARNESS_LABELS[harness]
  return harness ?? 'harness'
}

/** The live status line of a running call: how long, how much, doing what. */
function liveStatus(summary: RunSummary, t: HarnessTranslate): string {
  const bits = [t('card.elapsed', { n: seconds(Date.now() - summary.startedAt) })]
  if (summary.eventCount > 0) bits.push(t('card.events', { n: summary.eventCount }))
  if (summary.lastEventKind !== undefined) {
    bits.push(t('card.last', { type: t(`event.${summary.lastEventKind}`) }))
  }
  return bits.join(' · ')
}

/** Keep a disclosure toggle from also opening the details panel. */
function swallow(event: MouseEvent<HTMLDivElement>): void {
  event.stopPropagation()
}

/**
 * One tool-call card.
 *
 * @param props - the call identity and session the slot owner supplies, the
 *   running-or-settled block, the page run feed, bound translate, and the panel
 *   opener.
 * @returns the card tree.
 */
export function HarnessCallCard(props: {
  ctx: ClientContext
  callId: string
  sessionId: SessionId
  block: ToolCallBlock
  feed: RunFeed
  t: HarnessTranslate
  onOpen: (target: PanelTarget) => void
}): ReactNode {
  const { ctx, callId, sessionId, block, feed, t, onOpen } = props
  // Only the settled half of the union carries a `kind`; the running call has
  // no discriminant field of its own.
  const settled = 'kind' in block
  const args = readArgs(block)
  const result = readResult(block)
  // A settled card needs no roster: its own result carries the runId, so the
  // shared poller stops as soon as the last live call lands.
  const runs = useRoster(feed, !settled)
  const channel = useChannel(feed, !settled)
  const summary = settled ? undefined : matchRun(runs, callId, args.harness)
  const label = summary?.label ?? harnessLabel(args.harness)
  const channelError = settled ? undefined : channel.error

  // A running card has no result to read a runId off, but by the time it is
  // clicked the roster usually knows one — and carrying it is what lets a
  // persisted sidebar tab tell "not started yet" from "host restarted".
  const target = (): PanelTarget => ({
    callId,
    sessionId,
    harness: args.harness ?? summary?.harness,
    label,
    prompt: args.prompt,
    runId: result?.runId ?? summary?.runId,
    openedAt: Date.now(),
    result,
  })

  const open = (): void => {
    const next = target()
    if (!tryOpenSidebarTab(ctx, next, t)) onOpen(next)
  }

  const onKey = (event: KeyboardEvent<HTMLDivElement>): void => {
    // Only when the CARD itself holds focus. The full-reply `<summary>` is the
    // other focusable node in this tree, and its Enter/Space belongs to the
    // disclosure — `swallow` stops the mouse path, this stops the keyboard one.
    if (event.target !== event.currentTarget) return
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      open()
    }
  }

  if (settled) {
    const ok = result?.ok === true
    const text = result?.text ?? ''
    const errors = result?.errors ?? []
    const head: string[] = []
    if (result?.elapsedMs !== undefined) head.push(`${seconds(result.elapsedMs)}s`)
    if (result?.steps !== undefined) head.push(t('card.events', { n: result.steps }))
    return (
      <div className={css.card} role="button" tabIndex={0} title={t('card.openDone')} onClick={open} onKeyDown={onKey}>
        <div className={css.head}>
          <StateDot state={ok ? 'done' : 'error'} className={css.dot} />
          <span className={css.label}>{label}</span>
          <span className={css.meta}>{head.join(' · ')}</span>
        </div>
        {ok && text.length > 0 && <div className={css.reply}>{text}</div>}
        {result?.sessionId !== undefined && (
          <div className={css.meta}>
            {`session ${result.sessionId} · ${t(result.mode === 'resume' ? 'card.sessionResume' : 'card.sessionNew')}`}
          </div>
        )}
        {errors.length > 0 && (
          <div className={css.cardErrors}>{errors.slice(0, CARD_ERROR_LINES).join('\n')}</div>
        )}
        {text.length > 0 && (
          <div onClick={swallow}>
            <details className={css.disclosure}>
              <summary>{t('card.expandFull', { n: text.length })}</summary>
              <div className={css.disclosureText}>{text}</div>
            </details>
          </div>
        )}
      </div>
    )
  }

  const pending = unsettledCardState(summary, callId, Date.now())
  if (pending.kind === 'hostDone') {
    const head: string[] = []
    if (pending.elapsedMs !== undefined) head.push(`${seconds(pending.elapsedMs)}s`)
    head.push(t('card.events', { n: pending.eventCount }))
    return (
      <div className={css.card} role="button" tabIndex={0} title={t('card.openDone')} onClick={open} onKeyDown={onKey}>
        <div className={css.head}>
          <StateDot state={pending.ok ? 'done' : 'error'} className={css.dot} />
          <span className={css.label}>{label}</span>
          <span className={css.meta}>{head.join(' · ')}</span>
        </div>
        <div className={css.status}>{t('card.hostDonePending')}</div>
        {pending.sessionId !== null && (
          <div className={css.meta}>
            {`session ${pending.sessionId} · ${t(summary?.mode === 'resume' ? 'card.sessionResume' : 'card.sessionNew')}`}
          </div>
        )}
        {pending.errors.length > 0 && (
          <div className={css.cardErrors}>{pending.errors.slice(0, CARD_ERROR_LINES).join('\n')}</div>
        )}
      </div>
    )
  }

  // `null` is the host saying the harness never reported a session id.
  const liveSession = summary?.sessionId
  return (
    <div className={css.card} role="button" tabIndex={0} title={t('card.openRunning')} onClick={open} onKeyDown={onKey}>
      <div className={css.head}>
        <StateDot state="ongoing" className={css.dot} />
        <span className={css.label}>{`${label} · ${t('card.running')}`}</span>
      </div>
      <div className={css.status}>
        {channelError !== undefined
          ? t('card.channelDown')
          : summary === undefined || summary.phase === 'starting'
            ? t('card.starting')
            : liveStatus(summary, t)}
      </div>
      {channelError !== undefined && <div className={css.cardErrors}>{channelError}</div>}
      {liveSession !== null && liveSession !== undefined && (
        <div className={css.meta}>{`session ${liveSession}`}</div>
      )}
      {args.prompt !== undefined && (
        <div className={css.promptExcerpt}>{brief(args.prompt, PROMPT_EXCERPT_CHARACTERS)}</div>
      )}
    </div>
  )
}
