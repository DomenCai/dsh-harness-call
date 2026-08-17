/**
 * The browser half's copy, in the two locales the shell ships.
 *
 * `zh` is the authority: its keys ARE the namespace's dictionary union (see
 * ../client/contracts.ts), so `en` is typed against it and a key added to one
 * locale but not the other fails the build instead of silently falling back.
 *
 * @module dsh-harness-call/client/locales
 */

/** Locale namespace this half registers and binds. */
export const LOCALE_NS = 'harness-call'

const zh = {
  'cand.claude': '把这条消息委托给 Claude Code，自动续接其最近会话',
  'cand.codex': '把这条消息委托给 Codex CLI（默认只读沙箱），自动续接其最近会话',
  'cand.grok': '把这条消息委托给 Grok CLI，自动续接其最近会话',

  'card.starting': '启动中…',
  'card.running': '运行中',
  'card.elapsed': '{n}s',
  'card.events': '{n} 条事件',
  'card.last': '最近 {type}',
  'card.sessionNew': '新建',
  'card.sessionResume': '续接',
  'card.expandFull': '展开全文 · {n} 字符',
  'card.openDone': '点击查看完整过程与输出',
  'card.openRunning': '点击查看实时过程',

  'panel.title': '{label} · 过程与输出',
  'panel.close': '关闭面板（Esc）',
  'panel.sessionNew': '新会话',
  'panel.sessionResume': '续接会话',
  'panel.process': '过程 · {n} 条',
  'panel.dropped': '前 {n} 条事件已被丢弃，时间线从中途开始',
  'panel.reply': '回复',
  'panel.replyRunning': '回复（进行中）',
  'panel.errors': '错误',
  'panel.prompt': '发送的 prompt',
  'panel.noOutput': '暂无输出',
  'panel.waiting': '等待 harness 启动…',
  'panel.usageTurns': '{turns} 轮',

  'event.session': '会话',
  'event.reasoning': '思考',
  'event.text': '输出',
  'event.tool': '工具',
  'event.file': '文件',
  'event.error': '错误',
  'event.usage': '用量',
  'event.note': '备注',

  'event.exit': '退出码 {code}',
  'event.input': '参数',
  'file.create': '新建',
  'file.edit': '修改',
  'file.delete': '删除',
}

/** Every key of this namespace's dictionary. */
export type LocaleKey = keyof typeof zh

const en: Record<LocaleKey, string> = {
  'cand.claude': 'Delegate this message to Claude Code; continues its latest session',
  'cand.codex': 'Delegate this message to Codex CLI (read-only sandbox by default)',
  'cand.grok': 'Delegate this message to Grok CLI; continues its latest session',

  'card.starting': 'starting…',
  'card.running': 'running',
  'card.elapsed': '{n}s',
  'card.events': '{n} events',
  'card.last': 'last {type}',
  'card.sessionNew': 'new',
  'card.sessionResume': 'resumed',
  'card.expandFull': 'Full text · {n} chars',
  'card.openDone': 'Open the full process and output',
  'card.openRunning': 'Open the live process',

  'panel.title': '{label} · process & output',
  'panel.close': 'Close panel (Esc)',
  'panel.sessionNew': 'new session',
  'panel.sessionResume': 'resumed session',
  'panel.process': 'Process · {n} events',
  'panel.dropped': 'The first {n} events were discarded; this timeline starts mid-run',
  'panel.reply': 'Reply',
  'panel.replyRunning': 'Reply (in progress)',
  'panel.errors': 'Errors',
  'panel.prompt': 'Prompt sent',
  'panel.noOutput': 'No output yet',
  'panel.waiting': 'Waiting for the harness to start…',
  'panel.usageTurns': '{turns} turns',

  'event.session': 'session',
  'event.reasoning': 'thinking',
  'event.text': 'text',
  'event.tool': 'tool',
  'event.file': 'file',
  'event.error': 'error',
  'event.usage': 'usage',
  'event.note': 'note',

  'event.exit': 'exit {code}',
  'event.input': 'arguments',
  'file.create': 'created',
  'file.edit': 'edited',
  'file.delete': 'deleted',
}

/** The dictionaries in the shape `ctx.locale.register` takes. */
export const DICTIONARIES = { zh, en }
