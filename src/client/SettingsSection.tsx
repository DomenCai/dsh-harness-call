/**
 * Settings page: per-harness access and reasoning-effort defaults.
 *
 * @module dsh-harness-call/client/SettingsSection
 */

import { useState } from 'react'
import type { PropsLocale, PropsRuntime, InjectFace } from '@deepseek-ai/dsh-client-ui-slots'
import { HARNESS_KEYS, HARNESS_LABELS, type HarnessKey } from '../shared/harness.ts'
import {
  ACCESS_SETTINGS,
  EFFORT_SETTINGS,
  type AccessSetting,
  type EffortSetting,
  type HarnessCallSettings,
  type HarnessCallSettingsUpdate,
} from '../shared/policy.ts'
import css from './HarnessCall.module.css'

/** Injected business face: the live scope and durable write verbs. */
export interface HarnessSectionInjected {
  hooks: { scope: { getSnapshot(): { value: HarnessCallSettings }, subscribe(fn: () => void): () => void } }
  update: (next: HarnessCallSettingsUpdate) => Promise<void>
}

/** Full section props: runtime share + injected face + locale seat. */
export type HarnessSectionProps =
  PropsRuntime<'settings.section'>
  & InjectFace<HarnessSectionInjected>
  & PropsLocale<'harness-call'>

function FieldSelect<T extends string>(props: {
  label: string
  description: string
  value: T
  options: readonly T[]
  optionLabel: (value: T) => string
  disabled: boolean
  onChange: (value: T) => void
}) {
  return (
    <label className={css.settingsField}>
      <span className={css.settingsFieldLabel}>{props.label}</span>
      <span className={css.settingsFieldDesc}>{props.description}</span>
      <select
        className={css.settingsSelect}
        value={props.value}
        disabled={props.disabled}
        onChange={event => { props.onChange(event.target.value as T) }}
      >
        {props.options.map(option => (
          <option key={option} value={option}>{props.optionLabel(option)}</option>
        ))}
      </select>
    </label>
  )
}

/** Render one card per harness with access + effort selects. */
export function HarnessSettingsSection({
  useScope,
  update,
  t,
}: HarnessSectionProps) {
  const settings = useScope(snapshot => snapshot.value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | undefined>()

  const commit = async (next: HarnessCallSettingsUpdate): Promise<void> => {
    setSaving(true)
    setError(undefined)
    try {
      await update(next)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught))
    } finally {
      setSaving(false)
    }
  }

  const accessLabels: Record<AccessSetting, string> = {
    model: t('settings.access.model'),
    'read-only': t('settings.access.read-only'),
    'workspace-write': t('settings.access.workspace-write'),
    'full-access': t('settings.access.full-access'),
  }
  const effortLabels: Record<EffortSetting, string> = {
    model: t('settings.effort.model'),
    low: t('settings.effort.low'),
    medium: t('settings.effort.medium'),
    high: t('settings.effort.high'),
    xhigh: t('settings.effort.xhigh'),
  }

  return (
    <section className={css.settings} aria-labelledby="dsh-harness-call-settings-title">
      <h2 id="dsh-harness-call-settings-title" className={css.settingsTitle}>{t('settings.title')}</h2>
      <p className={css.settingsDesc}>{t('settings.desc')}</p>
      {HARNESS_KEYS.map((harness: HarnessKey) => {
        const policy = settings[harness]
        return (
          <div key={harness} className={css.settingsCard}>
            <div className={css.settingsCardTitle}>{HARNESS_LABELS[harness]}</div>
            <FieldSelect
              label={t('settings.access')}
              description={t('settings.accessDesc')}
              value={policy.access}
              options={ACCESS_SETTINGS}
              optionLabel={value => accessLabels[value]}
              disabled={saving}
              onChange={value => { void commit({ harness, field: 'access', value }) }}
            />
            <FieldSelect
              label={t('settings.effort')}
              description={t('settings.effortDesc')}
              value={policy.effort}
              options={EFFORT_SETTINGS}
              optionLabel={value => effortLabels[value]}
              disabled={saving}
              onChange={value => { void commit({ harness, field: 'effort', value }) }}
            />
          </div>
        )
      })}
      {saving && <div className={css.settingsHint}>{t('settings.saving')}</div>}
      {error !== undefined && <div className={css.settingsError}>{t('settings.error', { message: error })}</div>}
    </section>
  )
}
