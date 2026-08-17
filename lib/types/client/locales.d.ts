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
    };
    en: Record<"cand.claude" | "cand.codex" | "cand.grok" | "card.starting" | "card.running" | "card.elapsed" | "card.events" | "card.last" | "card.sessionNew" | "card.sessionResume" | "card.expandFull" | "card.openDone" | "card.openRunning" | "panel.title" | "panel.close" | "panel.sessionNew" | "panel.sessionResume" | "panel.process" | "panel.dropped" | "panel.reply" | "panel.replyRunning" | "panel.errors" | "panel.prompt" | "panel.noOutput" | "panel.waiting" | "panel.usageTurns" | "event.session" | "event.reasoning" | "event.text" | "event.tool" | "event.file" | "event.error" | "event.usage" | "event.note" | "event.exit" | "event.input" | "file.create" | "file.edit" | "file.delete", string>;
};
export {};
