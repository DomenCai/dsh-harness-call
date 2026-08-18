import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Settings page: per-harness access and reasoning-effort defaults.
 *
 * @module dsh-harness-call/client/SettingsSection
 */
import { useState } from 'react';
import { HARNESS_KEYS, HARNESS_LABELS } from "../shared/harness.js";
import { ACCESS_SETTINGS, EFFORT_SETTINGS, } from "../shared/policy.js";
import css from './HarnessCall.module.css';
function FieldSelect(props) {
    return (_jsxs("label", { className: css.settingsField, children: [_jsx("span", { className: css.settingsFieldLabel, children: props.label }), _jsx("span", { className: css.settingsFieldDesc, children: props.description }), _jsx("select", { className: css.settingsSelect, value: props.value, disabled: props.disabled, onChange: event => { props.onChange(event.target.value); }, children: props.options.map(option => (_jsx("option", { value: option, children: props.optionLabel(option) }, option))) })] }));
}
/** Render one card per harness with access + effort selects. */
export function HarnessSettingsSection({ useScope, update, t, }) {
    const settings = useScope(snapshot => snapshot.value);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState();
    const commit = async (next) => {
        setSaving(true);
        setError(undefined);
        try {
            await update(next);
        }
        catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
        }
        finally {
            setSaving(false);
        }
    };
    const accessLabels = {
        model: t('settings.access.model'),
        'read-only': t('settings.access.read-only'),
        'workspace-write': t('settings.access.workspace-write'),
        'full-access': t('settings.access.full-access'),
    };
    const effortLabels = {
        model: t('settings.effort.model'),
        low: t('settings.effort.low'),
        medium: t('settings.effort.medium'),
        high: t('settings.effort.high'),
        xhigh: t('settings.effort.xhigh'),
    };
    return (_jsxs("section", { className: css.settings, "aria-labelledby": "dsh-harness-call-settings-title", children: [_jsx("h2", { id: "dsh-harness-call-settings-title", className: css.settingsTitle, children: t('settings.title') }), _jsx("p", { className: css.settingsDesc, children: t('settings.desc') }), HARNESS_KEYS.map((harness) => {
                const policy = settings[harness];
                return (_jsxs("div", { className: css.settingsCard, children: [_jsx("div", { className: css.settingsCardTitle, children: HARNESS_LABELS[harness] }), _jsx(FieldSelect, { label: t('settings.access'), description: t('settings.accessDesc'), value: policy.access, options: ACCESS_SETTINGS, optionLabel: value => accessLabels[value], disabled: saving, onChange: value => { void commit({ harness, field: 'access', value }); } }), _jsx(FieldSelect, { label: t('settings.effort'), description: t('settings.effortDesc'), value: policy.effort, options: EFFORT_SETTINGS, optionLabel: value => effortLabels[value], disabled: saving, onChange: value => { void commit({ harness, field: 'effort', value }); } })] }, harness));
            }), saving && _jsx("div", { className: css.settingsHint, children: t('settings.saving') }), error !== undefined && _jsx("div", { className: css.settingsError, children: t('settings.error', { message: error }) })] }));
}
