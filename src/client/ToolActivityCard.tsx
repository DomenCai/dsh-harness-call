/**
 * One projected tool invocation as a row, in the shell's own tool-row idiom:
 * a 24px disclosure line (`name · path`, status and duration on the tail) that
 * expands into the block the payload deserves — TerminalBlock for a command,
 * ReadBlock for a `cat -n` read window, JsonBlock/CodeBlock for everything
 * else. Store-level byte truncation is annotated separately from each block's
 * own display-line fold.
 *
 * @module dsh-harness-call/client/ToolActivityCard
 */

import { useState, type ReactNode } from 'react'
import {
  CodeBlock,
  DisclosureRow,
  JsonBlock,
  ReadBlock,
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
  languageOf,
  parseNumberedLines,
  primaryArgument,
  type ToolActivity,
} from './activities.js'

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

/** The row tail: how long it took, and how it ended when that is not obvious. */
function tail(activity: ToolActivity, t: HarnessTranslate): string {
  const bits: string[] = []
  const duration = durationOf(activity)
  if (duration !== undefined) bits.push(duration)
  if (activity.exitCode !== undefined) bits.push(t('event.exit', { code: activity.exitCode }))
  if (activity.status === 'running') bits.push(t('activity.running'))
  return bits.join(' · ')
}

export function ToolActivityCard(props: {
  activity: ToolActivity
  t: HarnessTranslate
  cwd?: string
}): ReactNode {
  const { activity, t, cwd } = props
  const [open, setOpen] = useState(false)
  const command = isCommandTool(activity.name) ? commandLine(activity.input) : undefined
  const target = command ?? primaryArgument(activity.input)
  const output = activity.output !== undefined && activity.output.length > 0 ? activity.output : undefined
  const expandable = command !== undefined || output !== undefined || activity.input !== undefined
  // Safe to read the constant rather than ship the number per event: the store
  // truncates against this same constant and takes no override.
  const shown = activity.outputTruncated === true ? formatBytes(DEFAULT_MAX_TOOL_OUTPUT_BYTES) : undefined
  const original = activity.outputOriginalBytes !== undefined ? formatBytes(activity.outputOriginalBytes) : undefined

  return (
    <DisclosureRow
      icon={<StateDot state={statusDot(activity.status)} className={css.dot} />}
      title={activity.name}
      open={open && expandable}
      expandable={expandable}
      onToggle={() => { setOpen(value => !value) }}
      expandOnRowClick
      keepContentWhenOpen
      className={css.toolRow}
      titleClassName={css.toolName}
      collapsedContent={
        <>
          {target !== undefined && <span className={css.toolTarget}>{target}</span>}
          <span className={css.toolTail}>{tail(activity, t)}</span>
        </>
      }
    >
      <div className={css.toolBody}>
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
            {output !== undefined && <OutputBlock output={output} target={target} t={t} />}
          </>
        )}
        {shown !== undefined && original !== undefined && (
          <div className={css.toolTruncated}>{t('activity.truncated', { shown, original })}</div>
        )}
      </div>
    </DisclosureRow>
  )
}

/**
 * A read window renders as the file it came from — gutter numbers, grammar,
 * and the block's own head/tail fold. Anything else is text, and text is a
 * code block.
 */
function OutputBlock(props: { output: string, target: string | undefined, t: HarnessTranslate }): ReactNode {
  const { output, target, t } = props
  const lines = parseNumberedLines(output)
  const lang = languageOf(target)
  if (lines !== undefined) {
    return (
      <ReadBlock
        label={target ?? t('activity.output')}
        lines={lines}
        // The window's own length: the harness reports no file total, and
        // claiming one would put a made-up "showing N of M" in the banner.
        totalLines={lines.length}
        lang={lang}
        className={css.toolCode}
      />
    )
  }
  return <CodeBlock code={output} lang={lang} className={css.toolCode} />
}
