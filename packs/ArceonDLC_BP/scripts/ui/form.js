/*
 * Simple forms in the style of 8Crafter's Server Utilities
 * ("Block Source" dropdown + "Block IDs / Palette Data" text field).
 *
 * Field types:
 *   block    블록 소스 dropdown + 블록 ID / 패턴 text field  -> pattern string
 *   mask     text field (empty = everything)
 *   text     text field
 *   number   text field parsed as a number (min/max clamp)
 *   slider   integer slider (min, max, step)
 *   angle    slider in degrees (min, max, step; default -180..180 by 1)
 *   toggle   on/off
 *   dropdown options: [{value, label}]
 *   label / header  text only
 */
import { system, BlockTypes } from '@minecraft/server';
import { ActionFormData, FormCancelationReason, ModalFormData } from '@minecraft/server-ui';
import { session, save } from '../core/session.js';
import { permToString, short } from '../core/blocks.js';

export const SOURCES = ['직접 입력', '손에 든 블록', '바라보는 블록', '핫바 블록 섞기'];

/** Show a form, waiting while the player has chat or another screen open. */
export async function show(player, form) {
    for (let i = 0; i < 40; i++) {
        const r = await form.show(player);
        if (r.canceled && r.cancelationReason === FormCancelationReason.UserBusy) {
            await new Promise(res => system.runTimeout(res, 5));
            continue;
        }
        return r;
    }
    return { canceled: true };
}

/**
 * Turn a block source choice into a pattern string.
 * Throws with a readable message when the source has nothing usable.
 */
export function blockFromSource(player, source, text) {
    const s = session(player);
    const palettes = s.settings.palettes ?? [];
    if (source >= SOURCES.length) {
        const p = palettes[source - SOURCES.length];
        if (!p)
            throw new Error('팔레트가 없습니다');
        return p.data;
    }
    switch (source) {
        case 0:
            if (!String(text ?? '').trim())
                throw new Error('블록 ID / 패턴을 입력하세요');
            return String(text).trim();
        case 1: {
            const item = player.getComponent('minecraft:inventory')?.container?.getItem(player.selectedSlotIndex);
            if (!item)
                throw new Error('손에 블록을 들고 있지 않습니다');
            if (!BlockTypes.get(item.typeId))
                throw new Error(`${short(item.typeId)}은(는) 블록이 아닙니다`);
            return short(item.typeId);
        }
        case 2: {
            const hit = player.getBlockFromViewDirection({ maxDistance: 300, includeLiquidBlocks: true, includePassableBlocks: true });
            if (!hit?.block)
                throw new Error('바라보는 블록이 없습니다');
            return permToString(hit.block.permutation);
        }
        case 3: {
            const inv = player.getComponent('minecraft:inventory')?.container;
            const ids = [];
            for (let i = 0; i < 9; i++) {
                const it = inv?.getItem(i);
                if (it && BlockTypes.get(it.typeId) && !ids.includes(short(it.typeId)))
                    ids.push(short(it.typeId));
            }
            if (!ids.length)
                throw new Error('핫바에 블록이 없습니다');
            return ids.join(',');
        }
    }
    throw new Error('블록 소스를 고르세요');
}

/**
 * Show a modal form for `fields` and return {key: value}, or undefined if
 * closed. Values are remembered per form id.
 */
export async function ask(player, formId, title, fields, { submit = '실행', intro } = {}) {
    const s = session(player);
    const last = s.forms[formId] ?? {};
    const palettes = s.settings.palettes ?? [];
    const form = new ModalFormData().title(title);
    const slots = []; // {key, kind, field}
    const addSlot = (key, kind, field) => slots.push({ key, kind, field });
    if (intro) {
        form.label(intro);
        addSlot(null, 'label');
    }
    for (const f of fields) {
        const def = last[f.key] ?? f.default;
        switch (f.type) {
            case 'label':
                form.label(f.label);
                addSlot(null, 'label');
                break;
            case 'header':
                form.header(f.label);
                addSlot(null, 'label');
                break;
            case 'divider':
                form.divider();
                addSlot(null, 'label');
                break;
            case 'block': {
                const src = last[f.key + '#src'] ?? 0;
                const items = [...SOURCES, ...palettes.map(p => '팔레트: ' + p.name)];
                form.dropdown(`${f.label ?? '블록'} - 블록 소스`, items, { defaultValueIndex: Math.min(src, items.length - 1) });
                addSlot(f.key + '#src', 'dropdown', f);
                form.textField('블록 ID / 패턴', f.placeholder ?? 'stone 또는 50%stone,andesite', { defaultValue: String(last[f.key + '#text'] ?? f.default ?? ''), tooltip: f.tooltip ?? '직접 입력일 때 사용. 쉼표로 섞기, oak_slab 처럼 반블록이면 반블록으로 다듬음' });
                addSlot(f.key + '#text', 'text', f);
                if (f.palette !== false) {
                    form.toggle('직접 입력을 새 팔레트로 저장', { defaultValue: false });
                    addSlot(f.key + '#save', 'toggle', f);
                }
                break;
            }
            case 'mask':
            case 'text':
                form.textField(f.label, f.placeholder ?? '', { defaultValue: String(def ?? ''), tooltip: f.tooltip });
                addSlot(f.key, 'text', f);
                break;
            case 'number':
                form.textField(f.label + (f.min !== undefined ? ` (${f.min}~${f.max ?? ''})` : ''), String(f.default ?? ''), { defaultValue: String(def ?? ''), tooltip: f.tooltip });
                addSlot(f.key, 'number', f);
                break;
            case 'slider':
            case 'angle': {
                const min = f.min ?? (f.type === 'angle' ? -180 : 0);
                const max = f.max ?? (f.type === 'angle' ? 180 : 100);
                const v = Math.max(min, Math.min(max, Number(def ?? min)));
                form.slider(f.label + (f.type === 'angle' ? ' (°)' : ''), min, max, { valueStep: f.step ?? 1, defaultValue: v, tooltip: f.tooltip });
                addSlot(f.key, 'slider', f);
                break;
            }
            case 'toggle':
                form.toggle(f.label, { defaultValue: !!def, tooltip: f.tooltip });
                addSlot(f.key, 'toggle', f);
                break;
            case 'dropdown': {
                const idx = Math.max(0, f.options.findIndex(o => o.value === def));
                form.dropdown(f.label, f.options.map(o => o.label), { defaultValueIndex: idx, tooltip: f.tooltip });
                addSlot(f.key, 'dropdown', f);
                break;
            }
        }
    }
    form.submitButton(submit);
    const r = await show(player, form);
    if (r.canceled || !r.formValues)
        return undefined;
    const vals = r.formValues;
    // labels may or may not take a slot in formValues depending on version
    const inputs = slots.filter(x => x.kind !== 'label');
    const withLabels = vals.length === slots.length;
    const raw = {};
    let vi = 0;
    for (const sl of slots) {
        if (sl.kind === 'label') {
            if (withLabels)
                vi++;
            continue;
        }
        raw[sl.key] = vals[vi++];
    }
    void inputs;
    const out = {};
    const remember = {};
    for (const f of fields) {
        switch (f.type) {
            case 'label':
            case 'header':
            case 'divider':
                break;
            case 'block': {
                const src = Number(raw[f.key + '#src'] ?? 0);
                const text = String(raw[f.key + '#text'] ?? '');
                remember[f.key + '#src'] = src;
                remember[f.key + '#text'] = text;
                out[f.key + '#src'] = src;
                out[f.key + '#text'] = text;
                if (raw[f.key + '#save'] && text.trim()) {
                    const list = s.settings.palettes ?? (s.settings.palettes = []);
                    list.push({ name: text.trim().slice(0, 24), data: text.trim() });
                    if (list.length > 12)
                        list.shift();
                }
                break;
            }
            case 'number': {
                let n = parseFloat(String(raw[f.key] ?? '').trim());
                if (isNaN(n))
                    n = f.default ?? 0;
                if (f.min !== undefined)
                    n = Math.max(f.min, n);
                if (f.max !== undefined)
                    n = Math.min(f.max, n);
                if (f.int)
                    n = Math.round(n);
                out[f.key] = n;
                remember[f.key] = n;
                break;
            }
            case 'dropdown':
                out[f.key] = f.options[Number(raw[f.key] ?? 0)]?.value;
                remember[f.key] = out[f.key];
                break;
            case 'toggle':
                out[f.key] = !!raw[f.key];
                remember[f.key] = out[f.key];
                break;
            case 'slider':
                out[f.key] = Number(raw[f.key]);
                remember[f.key] = out[f.key];
                break;
            case 'angle':
                out[f.key] = Number(raw[f.key]);
                remember[f.key] = out[f.key];
                break;
            default:
                out[f.key] = String(raw[f.key] ?? '');
                remember[f.key] = out[f.key];
        }
    }
    s.forms[formId] = remember;
    save(player);
    return out;
}

/** Pattern string for a 'block' field from ask() output. */
export function blockValue(player, values, key) {
    return blockFromSource(player, values[key + '#src'] ?? 0, values[key + '#text']);
}

/**
 * Button menu. buttons: [{text, icon?, value}]. Returns the chosen value or undefined.
 */
export async function menu(player, title, body, buttons) {
    const form = new ActionFormData().title(title);
    if (body)
        form.body(body);
    for (const b of buttons)
        form.button(b.text, b.icon);
    const r = await show(player, form);
    if (r.canceled || r.selection === undefined)
        return undefined;
    return buttons[r.selection]?.value;
}

/** Yes / no question. */
export async function confirm(player, title, body, yes = '확인', no = '취소') {
    const v = await menu(player, title, body, [{ text: yes, value: true }, { text: no, value: false }]);
    return v === true;
}
