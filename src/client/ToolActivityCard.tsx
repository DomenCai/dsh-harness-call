/**
 * One projected tool invocation as a card: status, duration, folded
 * input/output. Command tools reuse TerminalBlock; everything else uses
 * JsonBlock / CodeBlock. Store-level byte truncation is annotated separately
 * from the display-line fold.
 *
 * @module dsh-harness-call/client/ToolActivityCard
 */

import { useState, type ReactNode } from 'react'
import {
  CodeBlock,
  DEFAULT_TERMINAL_MAX_LINES,
  JsonBlock,
  StateDot,
  TerminalBlock,
} from '@deepseek-ai/dsh-client-ui-primitives'
import { DEFAULT_MAX_TOOL_OUTPUT_BYTES } from '../shared/events.js'
import type { HarnessTranslate } from './contracts.js'
import css from './HarnessCall.module.css'
import {
  commandLine,
  formatBytes,
  formatDuration,
  isCommandTool,
  type ToolActivity,
} from './activities.js'

const OUTPUT_MAX_LINES = DEFAULT_TERMINAL_MAX_LINES

function statusDot(status: ToolActivity['status']): 'ongoing' | 'done' | 'error' {
  if (status === 'running') return 'ongoing'
  if (status === 'failed') return 'error'
  return 'done'
}

/** Absent while the tool still runs, and on an orphan finish whose start is gone. */
function durationOf(activity: ToolActivity): string | undefined {
  if (activity.finishAt === undefined || activity.startAt === undefined) return undefined
  return formatDuration(Math.max(0, activity.finishAt - activity.startAt))
}

function splitLines(text: string): string[] {
  return text.split(/\r?\n/)
}

function cappedText(text: string, expanded: boolean): { text: string, hidden: number } {
  const lines = splitLines(text)
  const hidden = lines.length - OUTPUT_MAX_LINES
  if (hidden <= 0 || expanded) return { text, hidden: Math.max(0, hidden) }
  const head = Math.ceil(OUTPUT_MAX_LINES / 2)
  const tail = OUTPUT_MAX_LINES - head
  return {
    text: [...lines.slice(0, head), '', ...lines.slice(lines.length - tail)].join('\n'),
    hidden,
  }
}

export function ToolActivityCard(props: {
  activity: ToolActivity
  t: HarnessTranslate
  cwd?: string
  compact?: boolean
}): ReactNode {
  const { activity, t, cwd, compact } = props
  const duration = durationOf(activity)
  const command = isCommandTool(activity.name) ? commandLine(activity.input) : undefined
  // Safe to read the constant rather than ship the number per event: the store
  // truncates against this same constant and takes no override.
  const shown = activity.outputTruncated === true ? formatBytes(DEFAULT_MAX_TOOL_OUTPUT_BYTES) : undefined
  const original = activity.outputOriginalBytes !== undefined ? formatBytes(activity.outputOriginalBytes) : undefined

  return (
    <div className={compact ? css.toolCardCompact : css.toolCard}>
      <div className={css.toolCardHead}>
        <StateDot state={statusDot(activity.status)} className={css.dot} />
        <span className={css.toolName}>{activity.name}</span>
        <span className={css.toolCardMeta}>
          {t(`activity.${activity.status}`)}
          {duration !== undefined ? ` · ${duration}` : ''}
          {activity.exitCode !== undefined ? ` · ${t('event.exit', { code: activity.exitCode })}` : ''}
        </span>
      </div>
      {command !== undefined ? (
        <TerminalBlock
          command={command}
          cwd={cwd}
          output={activity.output}
          exitCode={activity.exitCode}
          running={activity.status === 'running'}
          className={css.toolTerminal}
        />
      ) : (
        <>
          {activity.input !== undefined && (
            <JsonBlock label={t('activity.input')} payload={activity.input} defaultOpen={false} />
          )}
          {activity.output !== undefined && activity.output.length > 0 && (
            <OutputBlock text={activity.output} t={t} />
          )}
        </>
      )}
      {shown !== undefined && original !== undefined && (
        <div className={css.toolTruncated}>{t('activity.truncated', { shown, original })}</div>
      )}
    </div>
  )
}

function OutputBlock(props: { text: string, t: HarnessTranslate }): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const { text, hidden } = cappedText(props.text, expanded)
  return (
    <div className={css.toolOutput}>
      <div className={css.toolOutputLabel}>{props.t('activity.output')}</div>
      <CodeBlock code={text} />
      {hidden > 0 && (
        <button
          type="button"
          className={css.toolCapToggle}
          onClick={() => { setExpanded(value => !value) }}
        >
          {expanded ? props.t('activity.collapse') : props.t('activity.expand', { n: hidden })}
        </button>
      )}
    </div>
  )
}
