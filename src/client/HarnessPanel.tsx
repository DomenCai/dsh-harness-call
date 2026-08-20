/**
 * Overlay chrome around {@link HarnessRunView}: aside, Escape, focus restore.
 * Sidebar tabs render the same view without this shell.
 *
 * @module dsh-harness-call/client/HarnessPanel
 */

import { useEffect, useRef, type ReactNode } from 'react'
import type { HarnessTranslate } from './contracts.js'
import css from './HarnessCall.module.css'
import { HarnessRunView } from './HarnessRunView.js'
import type { PanelTarget, RunFeed } from './runs.js'

export type { PanelTarget }

export function HarnessPanel(props: {
  target: PanelTarget
  feed: RunFeed
  t: HarnessTranslate
  onClose: () => void
}): ReactNode {
  const { target, feed, t, onClose } = props
  const root = useRef<HTMLElement>(null)
  const previousFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const active = document.activeElement
    previousFocus.current = active instanceof HTMLElement ? active : null
    root.current?.focus()
    return () => {
      previousFocus.current?.focus()
    }
  }, [])

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [onClose])

  const title = t('panel.title', { label: target.label })
  return (
    <aside
      ref={root}
      className={css.panel}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
    >
      <div className={css.panelHead}>
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
      <HarnessRunView target={target} feed={feed} t={t} visible embedded />
    </aside>
  )
}
