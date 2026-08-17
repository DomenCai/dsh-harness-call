/**
 * Adapter registry for dsh-harness-call.
 *
 * Each adapter owns exactly one external CLI:
 * - `bin`          the executable name resolved through PATH
 * - `build(req)`   native argv / stdin / env for one run
 * - `onEvent`      folds one native JSONL event into shared state + timeline
 * - `finalize`     classifies the finished run into a common result shape
 *
 * The orchestrator in index.js is generic: adding a new harness means adding
 * one entry here, plus its key in the tool's harness enum (index.js), LABELS,
 * and the client's HARNESS_INFO list (client.js). No other wiring.
 *
 * Shared run request shape (produced by the orchestrator):
 *   { prompt, cwd, mode: 'new'|'resume', sessionId, sandbox, timeoutSeconds }
 *
 * Shared state object starts from newState() and is mutated by onEvent.
 * digest(kind, text, max) appends one timeline entry for the UI.
 */

export const LABELS = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok' }

export function uuidV4() {
  const h = () => Math.floor(Math.random() * 16).toString(16)
  const g = () => h() + h() + h() + h()
  const variant = ['8', '9', 'a', 'b'][Math.floor(Math.random() * 4)]
  return (
    g() + g() + '-' + g() + '-4' + g().slice(1) + '-' + variant + g().slice(1) + '-' + g() + g() + g()
  )
}

/** Flatten any value into a single-line brief string, truncated with an ellipsis. */
export function brief(value, max) {
  let text
  try {
    text = typeof value === 'string' ? value : JSON.stringify(value)
  } catch {
    text = String(value)
  }
  if (typeof text !== 'string') text = String(text)
  text = text.replace(/\s+/g, ' ').trim()
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** Fresh per-run state passed to onEvent/finalize. */
export function newState() {
  return { text: '', errorItems: [] }
}

export const ADAPTERS = {
  claude: {
    bin: 'claude',
    build(req) {
      const argv = ['--print', '--verbose', '--output-format', 'stream-json']
      argv.push(req.mode === 'resume' ? '--resume' : '--session-id', req.sessionId)
      return {
        argv,
        stdin: req.prompt,
        // A Claude Code host may inject short-lived gateway credentials into
        // the environment; the spawned CLI must run on its own credential
        // store, so tombstone them away (undefined removes the ambient key).
        env: { ANTHROPIC_AUTH_TOKEN: undefined, ANTHROPIC_BASE_URL: undefined },
      }
    },
    onEvent(event, state, digest) {
      if (
        event.type === 'assistant' &&
        !event.parent_tool_use_id &&
        Array.isArray(event.message && event.message.content)
      ) {
        for (const block of event.message.content) {
          if (block === null || block === undefined) continue
          if (block.type === 'text' && typeof block.text === 'string' && block.text.trim() !== '') {
            state.text += block.text
            digest('text', block.text, 200)
          } else if (block.type === 'thinking' && typeof block.thinking === 'string' && block.thinking.trim() !== '') {
            digest('thinking', block.thinking, 160)
          } else if (block.type === 'tool_use' && typeof block.name === 'string') {
            digest('tool', block.name + ' ' + brief(block.input, 100), 160)
          }
        }
      } else if (event.type === 'system' && event.subtype === 'init') {
        digest('sys', 'session init', 80)
      } else if (event.type === 'result') {
        state.result = event
      }
    },
    finalize(state, outcome, info) {
      const errors = []
      const r = state.result
      if (info.timedOut) errors.push(`claude exceeded ${info.timeoutSeconds}s and was terminated`)
      if (outcome.exitCode !== 0) {
        errors.push(`claude exited with code ${String(outcome.exitCode)}${outcome.signal ? ' ' + outcome.signal : ''}`)
      }
      if (r === undefined) errors.push('missing claude result event')
      else {
        if (r.is_error === true) errors.push(`claude error result (subtype ${String(r.subtype ?? '?')})`)
        else if (r.subtype !== 'success') errors.push(`unexpected claude result subtype: ${String(r.subtype ?? '?')}`)
        if (typeof r.session_id !== 'string') errors.push('claude result event has no session_id')
      }
      return {
        ok: errors.length === 0,
        text: r !== undefined && typeof r.result === 'string' && r.result.length > 0 ? r.result : state.text,
        sessionId: r !== undefined && typeof r.session_id === 'string' ? r.session_id : null,
        errors,
        extras: r !== undefined ? { costUsd: r.total_cost_usd ?? null, numTurns: r.num_turns ?? null } : {},
      }
    },
  },

  codex: {
    bin: 'codex',
    build(req) {
      if (req.mode === 'resume') {
        // A resumed session retains its original sandbox and writable roots.
        return { argv: ['exec', 'resume', '--json', req.sessionId, '-'], stdin: req.prompt, env: {} }
      }
      const sandbox = req.sandbox === 'workspace-write' ? 'workspace-write' : 'read-only'
      return {
        argv: ['exec', '--json', '--sandbox', sandbox, '--skip-git-repo-check', '--cd', req.cwd, '-'],
        stdin: req.prompt,
        env: {},
      }
    },
    onEvent(event, state, digest) {
      if (event.type === 'thread.started' && typeof event.thread_id === 'string') {
        state.sessionId = event.thread_id
        digest('sys', 'session ' + event.thread_id.slice(0, 8) + '…', 80)
      } else if (event.type === 'item.completed' && event.item !== null && event.item !== undefined) {
        const item = event.item
        if (item.type === 'agent_message' && typeof item.text === 'string') {
          state.text = item.text
          digest('text', item.text, 200)
        } else if (item.type === 'reasoning' && typeof item.text === 'string' && item.text.trim() !== '') {
          digest('thinking', item.text, 160)
        } else if (item.type === 'command_execution') {
          const parts = []
          if (typeof item.command === 'string') parts.push(item.command)
          if (typeof item.exit_code === 'number') parts.push('→ exit ' + item.exit_code)
          digest('tool', parts.length > 0 ? parts.join(' ') : 'command_execution', 160)
        } else if (item.type === 'file_change') {
          digest('tool', 'file_change ' + brief(item.path ?? item, 100), 160)
        } else if (item.type === 'web_search') {
          digest('tool', 'web_search ' + brief(item.query ?? '', 80), 160)
        } else if (item.type === 'error' && typeof item.message === 'string') {
          state.errorItems.push(item.message)
          digest('err', item.message, 160)
        } else {
          digest('sys', String(item.type), 80)
        }
      } else if (event.type === 'turn.completed') {
        state.completed = true
      } else if (event.type === 'turn.failed') {
        state.failed = event
      }
    },
    finalize(state, outcome, info) {
      const errors = []
      if (info.timedOut) errors.push(`codex exceeded ${info.timeoutSeconds}s and was terminated`)
      if (outcome.exitCode !== 0) {
        errors.push(`codex exited with code ${String(outcome.exitCode)}${outcome.signal ? ' ' + outcome.signal : ''}`)
      }
      if (state.sessionId === undefined) errors.push('missing codex thread.started event')
      if (state.failed !== undefined) {
        errors.push('codex turn failed: ' + brief((state.failed.error && state.failed.error.message) || 'unknown', 160))
      }
      if (state.completed !== true) errors.push('missing codex turn.completed event')
      if (!state.text) errors.push('missing codex agent message')
      for (const item of state.errorItems) errors.push('item error: ' + item)
      return {
        ok: errors.length === 0,
        text: state.text,
        sessionId: state.sessionId ?? null,
        errors,
        extras: {},
      }
    },
  },

  grok: {
    bin: 'grok',
    build(req) {
      const argv = [
        '-p',
        req.prompt,
        '--cwd',
        req.cwd,
        req.mode === 'resume' ? '--resume' : '--session-id',
        req.sessionId,
        '--output-format',
        'streaming-json',
        '--background-wait-timeout',
        String(req.timeoutSeconds),
      ]
      return { argv, stdin: null, env: {} }
    },
    onEvent(event, state, digest) {
      if (event.type === 'text' && typeof event.data === 'string') {
        state.text += event.data
      } else if (event.type === 'end') {
        state.end = event
      } else if (event.type === 'error') {
        state.error = event
        digest(
          'err',
          typeof event.message === 'string' && event.message.trim() !== '' ? event.message : 'grok error',
          160,
        )
      } else {
        digest('sys', String(event.type), 80)
      }
    },
    finalize(state, outcome, info) {
      const errors = []
      if (info.timedOut) errors.push(`grok exceeded ${info.timeoutSeconds}s and was terminated`)
      if (outcome.exitCode !== 0) {
        errors.push(`grok exited with code ${String(outcome.exitCode)}${outcome.signal ? ' ' + outcome.signal : ''}`)
      }
      if (state.error !== undefined) {
        errors.push(
          'grok error: ' +
            (typeof state.error.message === 'string' && state.error.message.trim() !== ''
              ? state.error.message
              : 'unknown'),
        )
      } else if (state.end === undefined) {
        errors.push('missing grok end event')
      } else {
        if (state.end.sessionId !== info.sessionId) {
          errors.push(
            `end event session mismatch: expected ${info.sessionId}, got ${String(state.end.sessionId ?? 'missing')}`,
          )
        }
        if (state.end.stopReason !== 'EndTurn' && state.end.stopReason !== 'end_turn') {
          errors.push(`unexpected grok stop reason: ${String(state.end.stopReason ?? 'missing')}`)
        }
      }
      return {
        ok: errors.length === 0,
        text: state.text,
        sessionId:
          state.end !== undefined && typeof state.end.sessionId === 'string' ? state.end.sessionId : info.sessionId,
        errors,
        extras: {},
      }
    },
  },
}

export const HARNESS_KEYS = Object.keys(ADAPTERS)
