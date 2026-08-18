/**
 * dsh-harness-call — browser half.
 *
 * Contributions:
 * - an `@` composer trigger source offering @claude / @codex / @grok;
 * - a `harness_call` tool card showing the live timeline while the external
 *   agent works, and its reply once it finishes;
 * - a floating `shell.overlay` panel with the full timeline and reply text;
 * - a `settings.section` page for per-harness access and effort defaults.
 *
 * Everything it displays comes from the host's `harnessCall` Remote, mounted
 * from the descriptors in ../shared/wire.ts — the same constant the host
 * embeds in its Typert manifest, so the two faces cannot drift.
 *
 * @module dsh-harness-call/client
 */

import { useEffect, useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'
import { createSnapshotStore, type ClientContext } from '@deepseek-ai/dsh-client-runtime/client'
import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import { HARNESS_KEYS } from '../shared/harness.ts'
import { defaultHarnessCallSettings, type HarnessCallSettingsUpdate } from '../shared/policy.ts'
import { HARNESS_CALL_CONTRIBUTION, SERVICE_KEY, type HarnessCallRemoteClient } from '../shared/wire.ts'
import type {} from './contracts.ts'
import { HarnessCallCard } from './HarnessCallCard.tsx'
import { HarnessPanel, type PanelTarget } from './HarnessPanel.tsx'
import { DICTIONARIES, LOCALE_NS } from './locales.ts'
import { createRunFeed } from './runs.ts'
import { HarnessSettingsSection, type HarnessSectionInjected } from './SettingsSection.tsx'

/** The tool this half renders a card for; the keyed-slot cell. */
const TOOL_NAME = 'harness_call'

/**
 * This half's cell in the frame-wide overlay list.
 *
 * `shell.overlay` is the additive seat for a surface of one's own: a fresh id
 * sits beside the shipped entries instead of replacing them. The details column
 * is NOT available for this — it is a single slot the conversation plugin
 * already occupies, and a second registration there either throws (killing this
 * plugin's whole `apply`) or shadows the shell's own tool details.
 */
const OVERLAY_ID = 'dsh-harness-call/run'
/**
 * Late in the list order. It only decides DOM order among overlay entries, and
 * this panel is a deliberate, dismissible surface: it belongs on top of the
 * ambient badges and pills that share the layer.
 */
const OVERLAY_ORDER = 100

/**
 * Drafts that are nothing but a mention. Enter on one of these is swallowed:
 * the question has not been typed yet, so Enter must neither send the bare tag
 * nor push the question onto its own line.
 */
const BARE_MENTIONS: ReadonlySet<string> = new Set(HARNESS_KEYS.map(key => `@${key}`))

/** Required services; the fiber stays pending until every one is present. */
export const inject = ['slots', 'inputTriggers', 'locale', 'remote']

export function apply(ctx: ClientContext): void {
  /**
   * The mounted Remote namespace. A closure binding rather than an effect local
   * because the cards and the panel render outside the mount effect and must
   * see it appear and disappear with the fiber, not hold a stale handle.
   */
  let api: HarnessCallRemoteClient | undefined

  const feed = createRunFeed(() => api)
  const settingsScope = createSnapshotStore({ value: defaultHarnessCallSettings() })
  let settingsGeneration = 0
  let settingsTail: Promise<void> = Promise.resolve()

  const reportSettingsError = (operation: 'read' | 'update', error: unknown): void => {
    console.error(`[dsh-harness-call] settings ${operation} failed:`, error)
  }

  const loadSettings = async (): Promise<void> => {
    const remote = api
    if (remote === undefined) return
    const generation = ++settingsGeneration
    try {
      const result = await remote.getSettings()
      if (api !== remote || generation !== settingsGeneration) return
      if (!result.ok) {
        reportSettingsError('read', result.error)
        return
      }
      settingsScope.set({ value: result.value })
    } catch (error) {
      if (api === remote && generation === settingsGeneration) reportSettingsError('read', error)
    }
  }

  const updateSettings = (update: HarnessCallSettingsUpdate): Promise<void> => {
    const operation = settingsTail.then(async () => {
      const remote = api
      if (remote === undefined) {
        const error = new Error('the harnessCall Remote is not mounted')
        reportSettingsError('update', error)
        throw error
      }
      const generation = ++settingsGeneration
      try {
        const result = await remote.updateSettings(update)
        if (api !== remote || generation !== settingsGeneration) return
        if (!result.ok) {
          reportSettingsError('update', result.error)
          throw new Error(`${result.error.code}: ${result.error.message}`)
        }
        settingsScope.set({ value: result.value })
      } catch (error) {
        if (api === remote && generation === settingsGeneration) reportSettingsError('update', error)
        throw error
      }
    })
    settingsTail = operation.catch(() => {})
    return operation
  }

  ctx.effect(async () => {
    // Mount failures used to throw and kill this fiber, which unregistered the
    // card itself and left the generic tool row with no explanation. Report
    // them on the feed instead so a live card can say the channel is down.
    try {
      const dispose = await ctx.remote.$mount(HARNESS_CALL_CONTRIBUTION)
      api = ctx.reflect.get(`remote.${SERVICE_KEY}`) as HarnessCallRemoteClient | undefined
      if (api === undefined) {
        feed.reportMount(`dsh-harness-call: the ${SERVICE_KEY} Remote namespace did not mount`)
        return () => {
          api = undefined
          void dispose()
        }
      }
      feed.reportMount(undefined)
      await loadSettings()
      return () => {
        settingsGeneration += 1
        api = undefined
        void dispose()
      }
    } catch (error) {
      feed.reportMount(error instanceof Error ? error.message : String(error))
      return () => {
        api = undefined
      }
    }
  }, 'dsh-harness-call: remote')

  ctx.effect(() => ctx.locale.register(LOCALE_NS, DICTIONARIES), 'dsh-harness-call: dictionaries')
  const t = ctx.locale.bind(LOCALE_NS)

  /**
   * Which run the floating panel is showing, or `undefined` for closed. Closure
   * state shared by the cards (which write it) and the overlay entry (which
   * reads it) — the two live in different slots with no common React ancestor,
   * so a store beats prop drilling through the shell.
   */
  const listeners = new Set<() => void>()
  let target: PanelTarget | undefined
  const subscribe = (listener: () => void): (() => void) => {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  }
  const publish = (next: PanelTarget | undefined): void => {
    target = next
    for (const listener of [...listeners]) listener()
  }
  const closePanel = (): void => { publish(undefined) }

  ctx.effect(() => ctx.inputTriggers.registerSource({
    trigger: '@',
    name: 'harness',
    order: 10,
    async candidates(_session, req) {
      return HARNESS_KEYS
        .filter(key => key.startsWith(req.query))
        .map(key => ({ name: key, description: t(`cand.${key}`) }))
    },
    onPick(pick) {
      return { text: `@${pick.candidate.name} ` }
    },
    async matchEnter(_session, line) {
      return BARE_MENTIONS.has(line.trim()) ? 'handled' : undefined
    },
    lexicon() {
      return HARNESS_KEYS
    },
  }), 'dsh-harness-call: @ trigger source')

  /**
   * The overlay occupant.
   *
   * The layer is root-scoped: it outlives every session switch, so this entry
   * does the session filtering the framework would otherwise have done. A target
   * belonging to another session is not merely hidden but DROPPED — navigating
   * away closes the panel for good, rather than resurrecting a stale run's
   * timeline on the way back.
   *
   * Keyed by `callId` so clicking a second card resets the panel's polling and
   * accumulation instead of grafting a new run onto the old one's state.
   */
  function OverlayEntry(props: PropsRuntime<'shell.overlay'>): ReactNode {
    const shown = useSyncExternalStore(subscribe, () => target)
    const session = props.useSessions(state => state.current)
    const foreign = shown !== undefined && shown.sessionId !== session
    useEffect(() => {
      if (foreign) closePanel()
    }, [foreign])
    if (shown === undefined || foreign) return null
    return <HarnessPanel key={shown.callId} target={shown} feed={feed} t={t} onClose={closePanel} />
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register(
    { name: 'shell.overlay', id: OVERLAY_ID, order: OVERLAY_ORDER },
    OverlayEntry,
  ))
  ctx.slots.inject('tool.call.toolview', () => ctx.slots.register(
    { name: 'tool.call.toolview', key: TOOL_NAME },
    props => (
      <HarnessCallCard
        callId={props.callId}
        sessionId={props.sessionId}
        block={props.block}
        feed={feed}
        t={t}
        onOpen={publish}
      />
    ),
  ))
  ctx.slots.inject('settings.section', () => ctx.slots.register({
    name: 'settings.section',
    id: 'harness-call',
    order: 56,
    label: () => t('nav'),
    locale: LOCALE_NS,
    inject: (): HarnessSectionInjected => ({
      hooks: { scope: settingsScope },
      update: updateSettings,
    }),
  }, HarnessSettingsSection))
}
