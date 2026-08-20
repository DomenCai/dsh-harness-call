/**
 * The shell contracts this half plugs into, restated where the shell does not
 * ship them to us.
 *
 * Three of the four seams arrive by declaration merging from packages we DO
 * have: `@deepseek-ai/dsh-client-ui-layout/client` brings the `shell.overlay`
 * seat this half floats its panel in, the locale plugin brings `ctx.locale`,
 * the input-trigger plugin brings `ctx.inputTriggers`. All three are type-only
 * imports — erased before the bundler sees them, so the client-bundle purity
 * gate never fires.
 *
 * `tool.call.toolview` is declared by `@deepseek-ai/dsh-client-ui-tool`, which
 * is not one of this package's dependencies, so its contract is declared here.
 * Only the members this plugin actually reads are stated: the slot is keyed by
 * tool name and hands the entry the call's identity plus the running-or-settled
 * node it was rendered for. The node type itself is NOT restated — it is
 * {@link ToolCallBlock} from the runtime, the same union the real declaration
 * uses, so the `'kind' in block` discrimination the readers in ./runs.ts perform
 * is checked rather than assumed.
 *
 * @module dsh-harness-call/client/contracts
 */

import type { ReactNode } from 'react'
import type { ToolCallBlock } from '@deepseek-ai/dsh-client-runtime/client'
import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'
// Declaration merges only: the 'shell.overlay' seat.
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
// Declaration merges only: ctx.locale.
import type {} from '@deepseek-ai/dsh-client-locale/client'
// Declaration merges only: ctx.inputTriggers.
import type {} from '@deepseek-ai/dsh-client-ui-input-trigger/client'
import type { LOCALE_NS, LocaleKey } from './locales.js'

/** This half's translate function, typed to ./locales.ts. */
export type HarnessTranslate = TranslateNS<typeof LOCALE_NS>

/**
 * The Better Sidebar surface this plugin consumes, restated locally.
 *
 * `dsh-better-sidebar` is an optional peer; its built `lib/types` may be
 * absent in a linked checkout, and a value import is forbidden by the
 * client-bundle purity gate. Only the members this plugin calls are named.
 */
export interface SidebarTab {
  id: string
  type: string
  title: string
  meta?: unknown
}

export interface SidebarState {
  panelOpen: boolean
  bottomOpen: boolean
  activePane: string | null
  splits: unknown
  bottomSplits: unknown
}

export interface SidebarSnapshot {
  sessionId?: string
  state?: SidebarState
}

export interface OpenTabSeed {
  type: string
  title?: string
  id?: string
  meta?: unknown
}

export interface SessionScope {
  sessionId: string
  cwd?: string
}

export interface TabComponentProps {
  tab: SidebarTab
  visible: boolean
  scope: SessionScope
}

export interface TabDescriptor {
  id: string
  title: string | (() => string)
  order?: number
  hidden?: boolean
  dedupeKey?: (tab: SidebarTab) => string | undefined
  component: (props: TabComponentProps) => ReactNode
}

export interface BetterSidebarService {
  registerTab(descriptor: TabDescriptor): () => void
  getTab(id: string): TabDescriptor | undefined
  openTab(seed: OpenTabSeed, scope?: SessionScope): void
  getSnapshot(): SidebarSnapshot
  readonly features: readonly string[]
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    betterSidebar: BetterSidebarService
  }
}

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Per-tool card inside a conversation tool call; keyed by tool name. */
    'tool.call.toolview': {
      kind: 'keyed'
      scope: 'session'
      owner: {
        /** Call identity, stable across the running and the settled form. */
        callId: string
        /** The frozen running call or settled result node. */
        block: ToolCallBlock
      }
    }
    /**
     * One settings page. Restated here because `@deepseek-ai/dsh-client-ui-settings`
     * is not a runtime dependency; the shell already declares the live seat.
     */
    'settings.section': {
      kind: 'list'
      scope: 'root'
      owner: {
        /** Close the settings panel (the shell owns the open state). */
        close: () => void
      }
    }
  }

  interface LocaleNamespaceMap {
    /** This plugin's own copy (../client/locales.ts). */
    'harness-call': LocaleKey
  }
}
