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
export declare const LOCALE_NS = "harness-call";
declare const zh: {
    'cand.claude': string;
    'cand.codex': string;
    'cand.grok': string;
    'card.starting': string;
    'card.channelDown': string;
    'card.running': string;
    'card.elapsed': string;
    'card.events': string;
    'card.last': string;
    'card.sessionNew': string;
    'card.sessionResume': string;
    'card.expandFull': string;
    'card.openDone': string;
    'card.openRunning': string;
    'panel.title': string;
    'panel.close': string;
    'panel.sessionNew': string;
    'panel.sessionResume': string;
    'panel.process': string;
    'panel.dropped': string;
    'panel.reply': string;
    'panel.replyRunning': string;
    'panel.errors': string;
    'panel.prompt': string;
    'panel.noOutput': string;
    'panel.waiting': string;
    'panel.channelDown': string;
    'panel.usageTurns': string;
    'event.session': string;
    'event.reasoning': string;
    'event.text': string;
    'event.tool': string;
    'event.file': string;
    'event.error': string;
    'event.usage': string;
    'event.note': string;
    'event.exit': string;
    'event.input': string;
    'file.create': string;
    'file.edit': string;
    'file.delete': string;
    nav: string;
    'settings.title': string;
    'settings.desc': string;
    'settings.access': string;
    'settings.accessDesc': string;
    'settings.effort': string;
    'settings.effortDesc': string;
    'settings.access.model': string;
    'settings.access.read-only': string;
    'settings.access.workspace-write': string;
    'settings.access.full-access': string;
    'settings.effort.model': string;
    'settings.effort.low': string;
    'settings.effort.medium': string;
    'settings.effort.high': string;
    'settings.effort.xhigh': string;
    'settings.saving': string;
    'settings.error': string;
};
/** Every key of this namespace's dictionary. */
export type LocaleKey = keyof typeof zh;
/** The dictionaries in the shape `ctx.locale.register` takes. */
export declare const DICTIONARIES: {
    zh: {
        'cand.claude': string;
        'cand.codex': string;
        'cand.grok': string;
        'card.starting': string;
        'card.channelDown': string;
        'card.running': string;
        'card.elapsed': string;
        'card.events': string;
        'card.last': string;
        'card.sessionNew': string;
        'card.sessionResume': string;
        'card.expandFull': string;
        'card.openDone': string;
        'card.openRunning': string;
        'panel.title': string;
        'panel.close': string;
        'panel.sessionNew': string;
        'panel.sessionResume': string;
        'panel.process': string;
        'panel.dropped': string;
        'panel.reply': string;
        'panel.replyRunning': string;
        'panel.errors': string;
        'panel.prompt': string;
        'panel.noOutput': string;
        'panel.waiting': string;
        'panel.channelDown': string;
        'panel.usageTurns': string;
        'event.session': string;
        'event.reasoning': string;
        'event.text': string;
        'event.tool': string;
        'event.file': string;
        'event.error': string;
        'event.usage': string;
        'event.note': string;
        'event.exit': string;
        'event.input': string;
        'file.create': string;
        'file.edit': string;
        'file.delete': string;
        nav: string;
        'settings.title': string;
        'settings.desc': string;
        'settings.access': string;
        'settings.accessDesc': string;
        'settings.effort': string;
        'settings.effortDesc': string;
        'settings.access.model': string;
        'settings.access.read-only': string;
        'settings.access.workspace-write': string;
        'settings.access.full-access': string;
        'settings.effort.model': string;
        'settings.effort.low': string;
        'settings.effort.medium': string;
        'settings.effort.high': string;
        'settings.effort.xhigh': string;
        'settings.saving': string;
        'settings.error': string;
    };
    en: Record<"cand.claude" | "cand.codex" | "cand.grok" | "card.starting" | "card.channelDown" | "card.running" | "card.elapsed" | "card.events" | "card.last" | "card.sessionNew" | "card.sessionResume" | "card.expandFull" | "card.openDone" | "card.openRunning" | "panel.title" | "panel.close" | "panel.sessionNew" | "panel.sessionResume" | "panel.process" | "panel.dropped" | "panel.reply" | "panel.replyRunning" | "panel.errors" | "panel.prompt" | "panel.noOutput" | "panel.waiting" | "panel.channelDown" | "panel.usageTurns" | "event.session" | "event.reasoning" | "event.text" | "event.tool" | "event.file" | "event.error" | "event.usage" | "event.note" | "event.exit" | "event.input" | "file.create" | "file.edit" | "file.delete" | "nav" | "settings.title" | "settings.desc" | "settings.access" | "settings.accessDesc" | "settings.effort" | "settings.effortDesc" | "settings.access.model" | "settings.access.read-only" | "settings.access.workspace-write" | "settings.access.full-access" | "settings.effort.model" | "settings.effort.low" | "settings.effort.medium" | "settings.effort.high" | "settings.effort.xhigh" | "settings.saving" | "settings.error", string>;
};
export {};
