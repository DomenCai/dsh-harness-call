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

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SessionId } from '@deepseek-ai/dsh-client-runtime/client'
import type { StoredEvent } from '../shared/events.ts'
import type { HarnessTranslate } from './contracts.ts'
import css from './HarnessCall.module.css'
import {
  brief, matchRun, seconds, useRoster, useRunDetail,
  type HarnessResult, type RunFeed,
} from './runs.ts'

/** Cap of the one-line summary a collapsed tool-argument disclosure shows. */
const INPUT_SUMMARY_CHARACTERS = 72

/**
 * What the card hands the panel when it is clicked. A snapshot of that moment,
 * never refreshed: nothing here may be used as a liveness signal.
 *
 * There is no `runId` of its own — the only run handle is `result.runId`, and it
 * exists exactly when the call has settled AND the host got far enough to open a
 * run record. A card that is still running knows only its `callId`, so the panel
 * resolves the run the same way the card does; a call that failed before any run
 * existed has neither handle, and its result is all there is to show.
 */
export interface PanelTarget {
  /** The tool call the card was rendered for; the correlation key. */
  callId: string
  /**
   * The conversation session the card lives in. The overlay layer is
   * root-scoped — it survives every session switch — so the panel's own owner
   * has to travel with the target.
   */
  sessionId: SessionId
  harness: string | undefined
  label: string
  /** The prompt the model composed, shown while the run is still going. */
  prompt: string | undefined
  /** The settled tool result, when there is one. */
  result: HarnessResult | undefined
}

/** Format one reported cost for the accounting footer. */
function cost(costUsd: number): string {
  return `$${costUsd.toFixed(4)}`
}

/**
 * Render one timeline event's body.
 *
 * @param event - the stored event.
 * @param t - bound translate.
 * @returns the body, or `null` for kinds the panel shows elsewhere.
 */
function eventBody(event: StoredEvent, t: HarnessTranslate): ReactNode {
  switch (event.kind) {
    case 'session':
      return <span className={css.note}>{`${t('event.session')} ${event.sessionId}`}</span>
    case 'reasoning':
      return <span className={css.reasoning}>{event.text}</span>
    case 'text':
      return event.text
    case 'tool':
      return (
        <div className={css.tool}>
          <span className={css.toolName}>{event.name}</span>
          {event.exitCode !== undefined && (
            <span className={css.toolExit}>{t('event.exit', { code: event.exitCode })}</span>
          )}
          {event.input !== undefined && (
            <details className={css.disclosure}>
              <summary>
                {`${t('event.input')} · ${brief(event.input, INPUT_SUMMARY_CHARACTERS)}`}
              </summary>
              <pre className={css.pre}>{JSON.stringify(event.input, null, 2) ?? ''}</pre>
            </details>
          )}
        </div>
      )
    case 'file':
      return (
        <span className={css.file}>
          <span className={css.fileChange}>{t(`file.${event.change}`)}</span>
          <span className={css.filePath}>{event.path}</span>
        </span>
      )
    case 'error':
      return <div className={css.rowError}>{event.message}</div>
    case 'usage':
      // Accounting is a run-level fact, not a moment in the process: it renders
      // once in the footer from the summary instead of inside the timeline.
      return null
    case 'note':
      return <span className={css.note}>{event.text}</span>
  }
}

/**
 * The floating panel for one harness run.
 *
 * @param props - the clicked target, the page run feed, bound translate, and
 *   the panel's own close action.
 * @returns the panel tree.
 */
export function HarnessPanel(props: {
  target: PanelTarget
  feed: RunFeed
  t: HarnessTranslate
  onClose: () => void
}): ReactNode {
  const { target, feed, t, onClose } = props
  const result = target.result
  /**
   * Only an UNSETTLED target consults the roster. A settled one either carries
   * its own `runId` or never had a run at all (the early-exit results in
   * host/tool.ts report no run), and guessing from the roster there would attach
   * a stranger's complete timeline to this call's failure.
   */
  const searching = result === undefined
  /**
   * ...and it stops consulting it once the run it found is over. The roster is
   * the shared page poller: leaving this subscription open would keep the whole
   * page polling `list()` for as long as the panel stays open. Dropping it does
   * not lose the answer — the feed keeps its last snapshot, so `matchRun` still
   * resolves the same run on every later render.
   */
  const [found, setFound] = useState(false)
  const runs = useRoster(feed, searching && !found)
  const run = searching ? matchRun(runs, target.callId, target.harness) : undefined
  const runId = result?.runId ?? run?.runId
  const view = useRunDetail(feed, runId, result !== undefined)

  const summary = view?.summary
  const phase = summary?.phase ?? run?.phase
  useEffect(() => {
    if (phase === 'done') setFound(true)
  }, [phase])

  // Escape closes the panel: it floats over the whole app, so the keyboard needs
  // a way out that does not involve locating the close button.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  /**
   * Focus lands in the panel when it opens, so Tab reaches the close button and
   * the disclosures instead of continuing through the conversation behind it.
   */
  const root = useRef<HTMLElement>(null)
  useEffect(() => { root.current?.focus() }, [])

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
  const meta: string[] = []
  if (sessionId !== undefined) meta.push(`session ${sessionId}`)
  if (mode !== undefined) meta.push(t(mode === 'resume' ? 'panel.sessionResume' : 'panel.sessionNew'))
  if (elapsedMs !== undefined) meta.push(`${seconds(elapsedMs)}s`)
  if (summary?.cwd !== undefined) meta.push(summary.cwd)
  else if (result?.cwd !== undefined) meta.push(result.cwd)

  const events = view?.events ?? []
  const dropped = summary?.droppedEvents ?? 0
  // Accounting falls back to the tool result, which carries the same two numbers:
  // the store is in-memory, so a card reopened after a host restart has no live
  // summary left and would otherwise lose its billing footer.
  const costUsd = summary?.costUsd ?? result?.costUsd
  const turns = summary?.turns ?? result?.turns
  const accounting: string[] = []
  if (costUsd !== undefined) accounting.push(cost(costUsd))
  if (turns !== undefined) accounting.push(t('panel.usageTurns', { turns }))

  const empty = events.length === 0 && text.length === 0 && errors.length === 0

  const title = t('panel.title', { label: target.label })
  return (
    <aside
      ref={root}
      className={css.panel}
      role="dialog"
      aria-label={title}
      aria-busy={done ? undefined : true}
      // Programmatically focusable only: the panel is a surface to read, the
      // close button is the thing in it worth tabbing to.
      tabIndex={-1}
    >
      <div className={css.panelHead}>
        <StateDot state={dot} className={css.dot} />
        <span>{title}</span>
        <button
          type="button"
          className={css.panelClose}
          aria-label={t('panel.close')}
          title={t('panel.close')}
          onClick={onClose}
        >
          ✕
        </button>
      </div>
      <div className={css.panelMeta}>{meta.length > 0 ? meta.join(' · ') : t('panel.waiting')}</div>
      <div className={css.panelBody}>
        {dropped > 0 && <div className={css.notice}>{t('panel.dropped', { n: dropped })}</div>}
        {events.length > 0 && (
          <>
            <div className={css.sectionLabel}>{t('panel.process', { n: events.length })}</div>
            <div className={css.timeline}>
              {events.map((event) => {
                const body = eventBody(event, t)
                // Kinds shown elsewhere contribute no row rather than a blank one.
                if (body === null) return null
                return (
                  <div key={event.seq} className={css.row}>
                    <span className={css.rowTime}>{`${seconds(event.at)}s`}</span>
                    <div className={css.rowBody}>{body}</div>
                  </div>
                )
              })}
            </div>
          </>
        )}
        {errors.length > 0 && (
          <>
            <div className={css.sectionLabel}>{t('panel.errors')}</div>
            <div className={css.errors}>{errors.join('\n')}</div>
          </>
        )}
        {text.length > 0 && (
          <>
            <div className={css.sectionLabel}>{t(done ? 'panel.reply' : 'panel.replyRunning')}</div>
            <div className={css.panelText}>{text}</div>
          </>
        )}
        {empty && <div className={css.hint}>{t('panel.noOutput')}</div>}
        {!done && target.prompt !== undefined && (
          <>
            <div className={css.sectionLabel}>{t('panel.prompt')}</div>
            <div className={css.prompt}>{target.prompt}</div>
          </>
        )}
      </div>
      {accounting.length > 0 && <div className={css.panelFoot}>{accounting.join(' · ')}</div>}
    </aside>
  )
}
