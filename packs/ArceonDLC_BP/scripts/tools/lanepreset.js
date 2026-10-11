/*
 * Save / delete custom lane presets (like assets, but for roads): build a
 * piece of road by hand, select one repeat of it (e.g. 8 blocks long for
 * 4-on 4-off dashes) across its full width, look along the road and save.
 * The lane road tool then lays it along any curve.
 */
import { facingDir, presetNames, removePreset, savePreset } from '../lib/lane_presets.js';

export default {
    id: 'lanepreset',
    name: '커스텀 차선 저장 · 지우기',
    desc: '직접 만든 도로 한 토막을 저장해 "차선 도로"에서 씁니다. 도로 전체 폭 × 점선 한 주기 길이(예: 8칸)를 선택하고, 도로가 뻗는 방향을 바라본 채 저장하세요.',
    icon: 'textures/blocks/concrete_white',
    needs: 'none',
    noEdit: true,
    get fields() {
        const names = presetNames();
        return [
            {
                key: 'action', type: 'dropdown', label: '할 일', default: 'save', options: [
                    { value: 'save', label: '선택 영역을 커스텀 차선으로 저장' },
                    { value: 'remove', label: '커스텀 차선 지우기' },
                ],
            },
            { key: 'name', type: 'text', label: '이름 (저장할 때)', placeholder: '예: 왕복6차로', default: '' },
            {
                key: 'dir', type: 'dropdown', label: '도로가 뻗는 방향 (저장할 때)', default: 'facing', options: [
                    { value: 'facing', label: '내가 바라보는 방향' },
                    { value: 'x', label: '동쪽 (+X)' },
                    { value: 'z', label: '남쪽 (+Z)' },
                ],
            },
            { type: 'label', label: `§7저장된 커스텀 차선: ${names.length ? names.join(', ') : '없음'}` },
            ...(names.length ? [{ key: 'target', type: 'dropdown', label: '지울 커스텀 차선', default: names[0], options: names.map(n => ({ value: n, label: n })) }] : []),
        ];
    },
    *run(ctx, v) {
        if (v.action === 'remove') {
            if (!v.target)
                throw new Error('저장된 커스텀 차선이 없습니다');
            removePreset(v.target);
            return `"${v.target}" 지움`;
        }
        const name = String(v.name ?? '').trim().slice(0, 24);
        if (!name)
            throw new Error('이름을 입력하세요');
        if (!ctx.region)
            throw new Error('저장할 도로 한 토막을 영역(1번·2번 지점)으로 선택하세요');
        const dir = v.dir === 'x' ? [1, 0] : v.dir === 'z' ? [0, 1] : facingDir(ctx.rotation.y);
        const r = savePreset(name, ctx.edit, ctx.region, dir);
        yield;
        return `커스텀 차선 "${name}" 저장: 폭 ${r.w}칸 × 길이 ${r.l}칸 × ${r.h}층. 차선 도로 > 차선 모양에서 고르세요`;
    },
};
