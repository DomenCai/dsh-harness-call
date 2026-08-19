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
  'cand.kimi': '把这条消息委托给 Kimi CLI，自动续接其最近会话',

  'card.starting': '启动中…',
  'card.channelDown': '进度通道未接通',
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
  'panel.channelDown': '进度通道未接通，卡片无法拉取实时过程',
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

  'nav': '外部 Harness',
  'settings.title': '外部 Harness',
  'settings.desc': '这些默认值会在下一次启动时生效。已经在跑的进程不会改参数。选「模型决定」时，由这次 harness_call 自己传参。',
  'settings.logs.title': '原始日志采集',
  'settings.logs.enabled': '保存完整 harness 调用日志',
  'settings.logs.desc': '下一次调用开始，把原始 stdout JSONL 行、stderr、关联后的语义事件、spawn 信息和最终结果写入独立 NDJSON 文件。不会改变现有卡片和详情展示。',
  'settings.logs.directory': '保存目录',
  'settings.logs.directoryDesc': '支持绝对路径、~/ 开头的路径；相对路径按每次调用的工作目录解析。',
  'settings.logs.warning': '原始日志不截断，可能包含完整 prompt、源码、命令输出、路径和其他敏感信息，也不会自动清理。仅在采样期间开启。',
  'settings.access': '权限',
  'settings.accessDesc': '只读、仓库可写或完全访问。完全访问会关闭该 CLI 的审批/沙箱限制，请只在信任的环境使用。',
  'settings.effort': '思考强度',
  'settings.effortDesc': '传给该 CLI 的推理档位。都不选时，用该 CLI 自己配置里的默认档位。',
  'settings.unsupported': '该 CLI 的 headless 模式不支持此项，选择不会生效',
  'settings.access.model': '模型决定',
  'settings.access.read-only': '只读',
  'settings.access.workspace-write': '仓库可写',
  'settings.access.full-access': '完全访问',
  'settings.effort.model': '模型决定',
  'settings.effort.low': '低',
  'settings.effort.medium': '中',
  'settings.effort.high': '高',
  'settings.effort.xhigh': '极高',
  'settings.effort.max': '最高',
  'settings.saving': '正在保存…',
  'settings.error': '保存失败：{message}',
}

/** Every key of this namespace's dictionary. */
export type LocaleKey = keyof typeof zh

const en: Record<LocaleKey, string> = {
  'cand.claude': 'Delegate this message to Claude Code; continues its latest session',
  'cand.codex': 'Delegate this message to Codex CLI (read-only sandbox by default)',
  'cand.grok': 'Delegate this message to Grok CLI; continues its latest session',
  'cand.kimi': 'Delegate this message to Kimi CLI; continues its latest session',

  'card.starting': 'starting…',
  'card.channelDown': 'progress channel is down',
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
  'panel.channelDown': 'Progress channel is down; the card cannot poll the live timeline',
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

  'nav': 'External harnesses',
  'settings.title': 'External harnesses',
  'settings.desc': 'These defaults apply to the next launch. A process that is already running keeps its original flags. Choose “Model decides” to let this harness_call pass its own arguments.',
  'settings.logs.title': 'Raw log capture',
  'settings.logs.enabled': 'Save complete harness call logs',
  'settings.logs.desc': 'Starting with the next call, write raw stdout JSONL lines, stderr, linked semantic events, spawn details, and the final verdict to a separate NDJSON file. Existing cards and details remain unchanged.',
  'settings.logs.directory': 'Save directory',
  'settings.logs.directoryDesc': 'Accepts absolute paths and ~/ paths; relative paths resolve from each call’s working directory.',
  'settings.logs.warning': 'Raw logs are untruncated and may contain complete prompts, source code, command output, paths, and other sensitive information. They are not cleaned up automatically. Enable only while sampling.',
  'settings.access': 'Access',
  'settings.accessDesc': 'Read-only, workspace-write, or full access. Full access turns off that CLI’s approval or sandbox limits — only use it in a trusted environment.',
  'settings.effort': 'Reasoning effort',
  'settings.effortDesc': 'The reasoning level passed to that CLI. When nothing is chosen, that CLI’s own configured default applies.',
  'settings.unsupported': 'Not supported by this CLI in headless mode; the choice has no effect',
  'settings.access.model': 'Model decides',
  'settings.access.read-only': 'Read-only',
  'settings.access.workspace-write': 'Workspace write',
  'settings.access.full-access': 'Full access',
  'settings.effort.model': 'Model decides',
  'settings.effort.low': 'Low',
  'settings.effort.medium': 'Medium',
  'settings.effort.high': 'High',
  'settings.effort.xhigh': 'Extra high',
  'settings.effort.max': 'Max',
  'settings.saving': 'Saving…',
  'settings.error': 'Could not save: {message}',
}

/** The dictionaries in the shape `ctx.locale.register` takes. */
export const DICTIONARIES = { zh, en }
