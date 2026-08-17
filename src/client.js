/**
 * dsh-harness-call — browser half.
 *
 * Shipped directly in the web ModuleLoader factory format (same shape the
 * esbuild-based plugins emit), so the package needs no build step. React is
 * the only external; every capability else arrives through injected Cordis
 * services.
 *
 * Contributions:
 * - `@` composer trigger source: @claude / @codex / @grok mentions with chip
 *   decoration, and Enter-swallowing while the draft is a bare mention so the
 *   tag stays on one line with the question being typed.
 * - `tool.call.toolview` card for harness_call: live progress while running
 *   (polled from the host's harnessCall/status Remote), reply preview, steps,
 *   session id, expandable full text; clicking opens the details panel.
 * - `details` column occupant: the process timeline (thinking / tool calls /
 *   errors with relative timestamps) plus the full reply, per harness.
 */
window.__ModuleLoader__.load({
  id: 'dsh-harness-call',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const React = require('react')

    const NAME = 'dsh-harness-call'
    const NS = 'harness-call'
    const TOOL_NAME = 'harness_call'

    const inject = ['slots', 'inputTriggers', 'layout', 'locale', 'remote']

    const HARNESS_INFO = [
      { key: 'claude', label: 'Claude Code' },
      { key: 'codex', label: 'Codex' },
      { key: 'grok', label: 'Grok' },
    ]
    const LABELS = { claude: 'Claude Code', codex: 'Codex', grok: 'Grok' }
    const KIND_ICONS = { thinking: '💭', text: '📄', tool: '🔧', sys: '·', err: '⚠' }
    const BARE_TOKENS = new Set(['@claude', '@codex', '@grok'])

    const zh = {
      'cand.claude': '把这条消息委托给 Claude Code，自动续接其最近会话',
      'cand.codex': '把这条消息委托给 Codex CLI（默认只读沙箱），自动续接其最近会话',
      'cand.grok': '把这条消息委托给 Grok CLI，自动续接其最近会话',
      'card.running': '运行中',
      'card.starting': '启动中…',
      'card.elapsed': '已运行 {n}s',
      'card.steps': '过程 {n} 条',
      'card.last': '最近 {type}',
      'card.stepCount': '{n} 步',
      'card.sessionNew': ' · 新建',
      'card.sessionResume': ' · 续接',
      'card.expandFull': '展开全文 · {n} 字符',
      'card.openDone': '点击在右侧面板查看完整过程与输出',
      'card.openRunning': '点击在右侧面板查看实时过程',
      'panel.title': '{label} · 过程与输出',
      'panel.close': '关闭面板',
      'panel.elapsed': '已运行 {n}s',
      'panel.sessionNew': '新会话',
      'panel.sessionResume': '续接会话',
      'panel.process': '过程 · {n} 条',
      'panel.reply': '回复',
      'panel.replyRunning': '回复（进行中）',
      'panel.errors': '错误',
      'panel.prompt': '发送的 prompt',
      'panel.noOutput': '暂无输出',
    }
    const en = {
      'cand.claude': 'Delegate this message to Claude Code; continues its latest session',
      'cand.codex': 'Delegate this message to Codex CLI (read-only sandbox by default)',
      'cand.grok': 'Delegate this message to Grok CLI; continues its latest session',
      'card.running': 'running',
      'card.starting': 'starting…',
      'card.elapsed': '{n}s elapsed',
      'card.steps': '{n} events',
      'card.last': 'last {type}',
      'card.stepCount': '{n} steps',
      'card.sessionNew': ' · new',
      'card.sessionResume': ' · resumed',
      'card.expandFull': 'Full text · {n} chars',
      'card.openDone': 'Open the side panel for the full process and output',
      'card.openRunning': 'Open the side panel for the live process',
      'panel.title': '{label} · process & output',
      'panel.close': 'Close panel',
      'panel.elapsed': '{n}s elapsed',
      'panel.sessionNew': 'new session',
      'panel.sessionResume': 'resumed session',
      'panel.process': 'Process · {n} events',
      'panel.reply': 'Reply',
      'panel.replyRunning': 'Reply (in progress)',
      'panel.errors': 'Errors',
      'panel.prompt': 'Prompt sent',
      'panel.noOutput': 'No output yet',
    }

    const CSS = [
      '.hc-card{border:1px solid color-mix(in srgb,currentColor 20%,transparent);border-radius:8px;padding:8px 10px;font-size:12px;line-height:1.55;margin:2px 0;cursor:pointer;transition:border-color .15s}',
      '.hc-card:hover{border-color:color-mix(in srgb,currentColor 45%,transparent)}',
      '.hc-head{display:flex;gap:8px;align-items:baseline;font-weight:600}',
      '.hc-dot{width:8px;height:8px;border-radius:50%;background:currentColor;flex:none;align-self:center;opacity:.9}',
      '.hc-dot.run{animation:hc-pulse 1.2s ease-in-out infinite}',
      '@keyframes hc-pulse{0%,100%{opacity:.2}50%{opacity:1}}',
      '.hc-meta{opacity:.72;font-size:11px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all}',
      '.hc-status{opacity:.8;font-size:11px}',
      '.hc-err{opacity:.9;white-space:pre-wrap;font-size:11px}',
      '.hc-reply{white-space:pre-wrap;margin-top:5px;font-size:12px;display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:3;overflow:hidden}',
      '.hc-text{white-space:pre-wrap;max-height:320px;overflow:auto;font-family:inherit;font-size:12px;margin-top:4px}',
      '.hc-details{margin-top:4px}',
      '.hc-details summary{cursor:pointer;opacity:.75;font-size:11px;user-select:none}',
      '.hc-panel{height:100%;min-height:0;display:flex;flex-direction:column;font-size:13px}',
      '.hc-panel-head{display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);font-weight:600;flex:none}',
      '.hc-panel-close{margin-left:auto;background:none;border:none;cursor:pointer;color:inherit;opacity:.6;font-size:13px;padding:4px 6px;border-radius:6px}',
      '.hc-panel-close:hover{opacity:1}',
      '.hc-panel-meta{padding:8px 14px;border-bottom:1px solid color-mix(in srgb,currentColor 12%,transparent);font-size:11px;opacity:.72;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;word-break:break-all;flex:none}',
      '.hc-panel-body{flex:1;min-height:0;overflow:auto;padding:12px 14px;line-height:1.6}',
      '.hc-section-label{font-size:11px;opacity:.6;margin:2px 0 6px;font-weight:600}',
      '.hc-panel-text{white-space:pre-wrap;word-break:break-word}',
      '.hc-panel-hint{opacity:.6}',
      '.hc-panel-prompt{white-space:pre-wrap;opacity:.8;font-size:12px;border:1px dashed color-mix(in srgb,currentColor 25%,transparent);border-radius:8px;padding:8px 10px;margin-top:6px}',
      '.hc-tl{display:flex;flex-direction:column;gap:6px;margin-bottom:14px}',
      '.hc-tl-item{display:flex;gap:7px;align-items:flex-start;font-size:12px;line-height:1.5}',
      '.hc-tl-k{flex:none;width:16px;text-align:center;opacity:.8}',
      '.hc-tl-t{flex:none;width:36px;text-align:right;opacity:.5;font-size:10px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace}',
      '.hc-tl-s{flex:1;min-width:0;white-space:pre-wrap;word-break:break-word}',
      '.hc-tl-s[data-k="thinking"]{opacity:.72;font-style:italic}',
      '.hc-tl-s[data-k="tool"]{opacity:.85;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px}',
      '.hc-tl-s[data-k="sys"]{opacity:.55;font-size:11px}',
    ].join('\n')

    function insertStyles(css) {
      const tag = document.createElement('style')
      tag.dataset.plugin = NAME
      tag.textContent = css
      document.head.appendChild(tag)
      return () => {
        tag.remove()
      }
    }

    /** Remote invocation descriptors; must mirror the host TYPERT_MANIFEST. */
    const REMOTE_DESCRIPTORS = [
      {
        id: 'dsh-harness-call#harnessCall/status',
        service: 'harnessCall',
        namespace: 'harnessCall',
        method: 'status',
        invocation: { kind: 'direct' },
        parameters: [{ name: 'harness', wire: 'harness', source: 'json', codec: { mode: 'src-json' } }],
        result: { mode: 'src-json' },
      },
    ]
    const REMOTE = { package: NAME, descriptors: REMOTE_DESCRIPTORS }

    function readArgs(block) {
      const settled = block !== undefined && block !== null && block.kind === 'tool-result'
      const raw = settled
        ? block.call !== null && block.call !== undefined
          ? block.call.argsRaw
          : ''
        : block !== undefined && block !== null
          ? block.argsRaw
          : ''
      if (typeof raw !== 'string' || raw.length === 0) return {}
      try {
        return JSON.parse(raw)
      } catch {
        return {}
      }
    }

    function readResult(block) {
      if (block === undefined || block === null || block.kind !== 'tool-result') return null
      const content = Array.isArray(block.content) ? block.content : []
      for (const item of content) {
        if (item !== null && item !== undefined && item.type === 'text' && typeof item.text === 'string') {
          try {
            return JSON.parse(item.text)
          } catch {
            return null
          }
        }
      }
      return null
    }

    function seconds(ms) {
      return Math.round((ms || 0) / 1000) + 's'
    }

    function applyClient(ctx) {
      let remoteApi = undefined

      ctx.effect(() => insertStyles(CSS), NAME + ': styles')
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), NAME + ': dictionaries')
      const t = ctx.locale.bind(NS)

      ctx.effect(async () => {
        const dispose = await ctx.remote.$mount(REMOTE)
        remoteApi = ctx.reflect.get('remote.harnessCall')
        if (remoteApi === undefined) throw new Error(NAME + ': the harnessCall Remote namespace did not mount')
        return () => {
          remoteApi = undefined
          void dispose()
        }
      }, NAME + ': remote')

      const fetchStatus = (harness) => {
        if (remoteApi === undefined) return Promise.resolve(null)
        return remoteApi
          .status(harness)
          .then((result) => (result !== null && result !== undefined && result.ok === true ? result.value : null))
          .catch(() => null)
      }

      // ── shared side-panel state (closure pub/sub between card and details) ──
      const listeners = new Set()
      const panel = { open: false, data: null }
      const notify = () => {
        for (const listener of Array.from(listeners)) {
          try {
            listener()
          } catch {
            /* listener failed */
          }
        }
      }
      const layout = () => ctx.get('layout')
      const openPanel = (data) => {
        panel.open = true
        panel.data = data
        const l = layout()
        if (l !== undefined) l.openDetails()
        notify()
      }
      const closePanel = () => {
        panel.open = false
        panel.data = null
        const l = layout()
        if (l !== undefined) l.closeDetails()
        notify()
      }

      // ── '@claude / @codex / @grok' composer mentions ──
      const inputTriggers = ctx.get('inputTriggers')
      if (inputTriggers !== undefined) {
        ctx.effect(
          () =>
            inputTriggers.registerSource({
              trigger: '@',
              name: 'harness',
              order: 10,
              async candidates(_session, req) {
                return HARNESS_INFO.filter((item) => item.key.startsWith(req.query)).map((item) => ({
                  name: item.key,
                  description: t('cand.' + item.key),
                }))
              },
              onPick(pick) {
                return { text: '@' + pick.candidate.name + ' ' }
              },
              // Swallow Enter while the draft is exactly a bare mention: the
              // question is not typed yet, so Enter must neither send the bare
              // tag nor newline it onto its own line.
              matchEnter(_session, line) {
                return BARE_TOKENS.has(line.trim()) ? 'handled' : undefined
              },
              lexicon() {
                return ['claude', 'codex', 'grok']
              },
            }),
          NAME + ': @ trigger source',
        )
      }

      /** Poll the host run snapshot while a call is live. */
      function useHarnessStatus(harness, active) {
        const state = React.useState(null)
        const status = state[0]
        const setStatus = state[1]
        React.useEffect(() => {
          if (!active || harness === '') return undefined
          let stopped = false
          const tick = () => {
            fetchStatus(harness).then((snapshot) => {
              if (!stopped && snapshot !== null) setStatus(snapshot)
            })
          }
          tick()
          const timer = setInterval(tick, 2000)
          return () => {
            stopped = true
            clearInterval(timer)
          }
        }, [active, harness])
        return status
      }

      function Timeline(props) {
        const events = Array.isArray(props.events) ? props.events : []
        if (events.length === 0) return null
        const rows = events.map((item, index) =>
          React.createElement(
            'div',
            { key: 'e' + index, className: 'hc-tl-item' },
            React.createElement('span', { key: 'k', className: 'hc-tl-k' }, KIND_ICONS[item.k] || '·'),
            React.createElement('span', { key: 't', className: 'hc-tl-t' }, typeof item.t === 'number' ? item.t + 's' : ''),
            React.createElement('span', { key: 's', className: 'hc-tl-s', 'data-k': item.k }, String(item.s ?? '')),
          ),
        )
        return React.createElement('div', { className: 'hc-tl' }, rows)
      }

      function PanelBody(props) {
        const data = props.data
        const status = useHarnessStatus(data.harness, data.settled !== true)

        const sections = []
        let events = null
        let text = null
        let errors = null
        const metaBits = []
        let done = false

        if (data.settled === true) {
          const result = readResult(data.block)
          if (result !== null) {
            events = Array.isArray(result.events) ? result.events : null
            text = typeof result.text === 'string' && result.text.length > 0 ? result.text : null
            errors = Array.isArray(result.errors) && result.errors.length > 0 ? result.errors : null
            if (result.sessionId !== null && result.sessionId !== undefined) metaBits.push('session ' + result.sessionId)
            if (result.mode !== null && result.mode !== undefined) {
              metaBits.push(t(result.mode === 'resume' ? 'panel.sessionResume' : 'panel.sessionNew'))
            }
            if (result.elapsedMs !== null && result.elapsedMs !== undefined) metaBits.push(seconds(result.elapsedMs))
            if (typeof result.cwd === 'string') metaBits.push(result.cwd)
          }
          done = true
        } else if (status !== null && status !== undefined) {
          metaBits.push(t('panel.elapsed', { n: status.elapsedSeconds ?? 0 }))
          events = Array.isArray(status.events) ? status.events : null
          if (status.phase === 'done') {
            done = true
            text = typeof status.text === 'string' && status.text.length > 0 ? status.text : null
          }
          errors = Array.isArray(status.errors) && status.errors.length > 0 ? status.errors : null
          if (typeof status.sessionId === 'string' && status.sessionId !== null) metaBits.push('session ' + status.sessionId)
        } else {
          metaBits.push(t('card.starting'))
        }

        if (events !== null) {
          sections.push(
            React.createElement('div', { key: 'tl-label', className: 'hc-section-label' }, t('panel.process', { n: events.length })),
          )
          sections.push(React.createElement(Timeline, { key: 'tl', events }))
        }
        if (text !== null) {
          sections.push(
            React.createElement('div', { key: 'tx-label', className: 'hc-section-label' }, t(done ? 'panel.reply' : 'panel.replyRunning')),
          )
          sections.push(React.createElement('div', { key: 'tx', className: 'hc-panel-text' }, text))
        }
        if (errors !== null) {
          sections.push(React.createElement('div', { key: 'er-label', className: 'hc-section-label' }, t('panel.errors')))
          sections.push(React.createElement('div', { key: 'er', className: 'hc-err' }, errors.join('\n')))
        }
        if (sections.length === 0) {
          sections.push(React.createElement('div', { key: 'empty', className: 'hc-panel-hint' }, t('panel.noOutput')))
        }
        if (!done) {
          const args = readArgs(data.block)
          if (typeof args.prompt === 'string' && args.prompt.length > 0) {
            sections.push(React.createElement('div', { key: 'p-label', className: 'hc-section-label' }, t('panel.prompt')))
            sections.push(React.createElement('div', { key: 'p', className: 'hc-panel-prompt' }, args.prompt))
          }
        }
        const body = [React.createElement('div', { key: 'meta', className: 'hc-panel-meta' }, metaBits.join(' · '))].concat(
          sections,
        )
        return React.createElement('div', { className: 'hc-panel-body' }, body)
      }

      function HarnessPanel() {
        const state = React.useState(0)
        const setVersion = state[1]
        React.useEffect(() => {
          const bump = () => setVersion((v) => v + 1)
          listeners.add(bump)
          return () => {
            listeners.delete(bump)
          }
        }, [])
        if (panel.open !== true || panel.data === null) return null
        const data = panel.data
        const label = LABELS[data.harness] || data.harness || 'harness'

        const head = React.createElement(
          'div',
          { key: 'head', className: 'hc-panel-head' },
          React.createElement('span', { key: 'dot', className: 'hc-dot' }),
          React.createElement('span', { key: 'name' }, t('panel.title', { label })),
          React.createElement(
            'button',
            {
              key: 'close',
              type: 'button',
              className: 'hc-panel-close',
              'aria-label': t('panel.close'),
              onClick: () => {
                closePanel()
              },
            },
            '✕',
          ),
        )

        return React.createElement(
          'div',
          { className: 'hc-panel' },
          [head, React.createElement(PanelBody, { key: 'body', data })],
        )
      }

      function HarnessCallCard(props) {
        const block = props.block
        const settled = block !== undefined && block !== null && block.kind === 'tool-result'
        const args = readArgs(block)
        const harnessKey = typeof args.harness === 'string' ? args.harness : ''
        const label = LABELS[harnessKey] || harnessKey || 'harness'
        const status = useHarnessStatus(harnessKey, !settled)

        const open = () => {
          openPanel({ harness: harnessKey, block, settled })
        }

        if (settled) {
          const result = readResult(block)
          const ok = result !== null && result.ok === true
          const text = result !== null && typeof result.text === 'string' ? result.text : ''
          const stepCount = result !== null && Array.isArray(result.events) ? result.events.length : 0
          const headBits = []
          if (result !== null && result.elapsedMs !== null && result.elapsedMs !== undefined) {
            headBits.push(seconds(result.elapsedMs))
          }
          if (stepCount > 0) headBits.push(t('card.stepCount', { n: stepCount }))
          const children = []
          children.push(
            React.createElement(
              'div',
              { key: 'head', className: 'hc-head' },
              React.createElement('span', { key: 'dot', className: 'hc-dot', style: { opacity: ok ? 0.9 : 0.4 } }),
              React.createElement('span', { key: 'name' }, (ok ? '✓ ' : '✗ ') + label),
              React.createElement('span', { key: 'time', className: 'hc-meta' }, headBits.join(' · ')),
            ),
          )
          if (ok && text.length > 0) {
            children.push(React.createElement('div', { key: 'reply', className: 'hc-reply' }, text))
          }
          if (result !== null && result.sessionId !== null && result.sessionId !== undefined) {
            children.push(
              React.createElement(
                'div',
                { key: 'sid', className: 'hc-meta' },
                'session ' +
                  result.sessionId +
                  t(result.mode === 'resume' ? 'card.sessionResume' : 'card.sessionNew'),
              ),
            )
          }
          if (result !== null && Array.isArray(result.errors) && result.errors.length > 0) {
            children.push(React.createElement('div', { key: 'err', className: 'hc-err' }, result.errors.slice(0, 4).join('\n')))
          }
          if (text.length > 0) {
            children.push(
              React.createElement(
                'div',
                {
                  key: 'text',
                  onClick: (event) => {
                    event.stopPropagation()
                  },
                },
                React.createElement(
                  'details',
                  { className: 'hc-details' },
                  React.createElement('summary', null, t('card.expandFull', { n: text.length })),
                  React.createElement('div', { className: 'hc-text' }, text),
                ),
              ),
            )
          }
          return React.createElement(
            'div',
            { className: 'hc-card', title: t('card.openDone'), onClick: open },
            children,
          )
        }

        const running = []
        running.push(
          React.createElement(
            'div',
            { key: 'head', className: 'hc-head' },
            React.createElement('span', { key: 'dot', className: 'hc-dot run' }),
            React.createElement('span', { key: 'name' }, label + ' · ' + t('card.running')),
          ),
        )
        const bits = []
        if (status !== null && status !== undefined) {
          if (status.elapsedSeconds !== undefined) bits.push(t('card.elapsed', { n: status.elapsedSeconds }))
          if (Array.isArray(status.events)) bits.push(t('card.steps', { n: status.events.length }))
          if (status.lastEventType !== undefined) bits.push(t('card.last', { type: status.lastEventType }))
          running.push(React.createElement('div', { key: 'st', className: 'hc-status' }, bits.join(' · ')))
          if (status.sessionId !== undefined && status.sessionId !== null) {
            running.push(React.createElement('div', { key: 'sid', className: 'hc-meta' }, 'session ' + status.sessionId))
          }
        } else {
          running.push(React.createElement('div', { key: 'st', className: 'hc-status' }, t('card.starting')))
        }
        if (typeof args.prompt === 'string' && args.prompt.length > 0) {
          const excerpt = args.prompt.length > 140 ? args.prompt.slice(0, 140) + '…' : args.prompt
          running.push(React.createElement('div', { key: 'p', className: 'hc-status', style: { marginTop: 2 } }, excerpt))
        }
        return React.createElement(
          'div',
          { className: 'hc-card', title: t('card.openRunning'), onClick: open },
          running,
        )
      }

      const slots = ctx.get('slots')
      if (slots !== undefined) {
        // The details column host: session-scoped by the layout (auto-closes on
        // session switch, resizable; the conversation column re-centers).
        slots.inject('details', () =>
          slots.register({ name: 'details' }, HarnessPanel),
        )
        slots.inject('tool.call.toolview', () =>
          slots.register({ name: 'tool.call.toolview', key: TOOL_NAME }, HarnessCallCard),
        )
      }
    }

    exports.name = NAME
    exports.inject = inject
    exports.apply = applyClient
    return module.exports
  },
})
