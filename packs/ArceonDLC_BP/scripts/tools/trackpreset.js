/*
 * Save / delete track pieces for the railway tool: build a straight piece
 * of track by hand (ballast, sleepers, rails, anything), select its full
 * width × one repeat (e.g. 2 blocks for sleeper-gap) and all its layers,
 * look along the track and save.
 */
import { facingDir } from '../lib/lane_presets.js';
import { removeTrack, saveTrack, trackNames } from '../lib/track_presets.js';

export default {
    id: 'trackpreset',
    name: '철도 선로 저장 · 지우기',
    desc: '직접 만든 선로 한 토막을 저장해 "철도"에서 씁니다. 선로 전체 폭 × 침목 한 주기 길이(예: 2칸) × 자갈부터 레일까지 높이를 선택하고, 선로 방향을 바라본 채 저장하세요.',
    icon: 'textures/blocks/rail_normal',
    needs: 'none',
    noEdit: true,
    get fields() {
        const names = trackNames();
        return [
            {
                key: 'action', type: 'dropdown', label: '할 일', default: 'save', options: [
                    { value: 'save', label: '선택 영역을 선로로 저장' },
                    { value: 'remove', label: '저장한 선로 지우기' },
                ],
            },
            { key: 'name', type: 'text', label: '이름 (저장할 때)', placeholder: '예: 복선', default: '' },
            {
                key: 'dir', type: 'dropdown', label: '선로가 뻗는 방향 (저장할 때)', default: 'facing', options: [
                    { value: 'facing', label: '내가 바라보는 방향' },
                    { value: 'x', label: '동쪽 (+X)' },
                    { value: 'z', label: '남쪽 (+Z)' },
                ],
            },
            {
                key: 'anchor', type: 'dropdown', label: '곡선 점 높이에 올 층', default: 'bottom', options: [
                    { value: 'bottom', label: '맨 아래 층 (자갈 바닥)' },
                    { value: 'top', label: '맨 위 층' },
                ],
            },
            { type: 'label', label: `§7저장된 선로: ${names.length ? names.join(', ') : '없음'}` },
            ...(names.length ? [{ key: 'target', type: 'dropdown', label: '지울 선로', default: names[0], options: names.map(n => ({ value: n, label: n })) }] : []),
        ];
    },
    *run(ctx, v) {
        if (v.action === 'remove') {
            if (!v.target)
                throw new Error('저장된 선로가 없습니다');
            removeTrack(v.target);
            return `"${v.target}" 지움`;
        }
        const name = String(v.name ?? '').trim().slice(0, 24);
        if (!name)
            throw new Error('이름을 입력하세요');
        if (!ctx.region)
            throw new Error('저장할 선로 한 토막을 영역(1번·2번 지점)으로 선택하세요');
        const dir = v.dir === 'x' ? [1, 0] : v.dir === 'z' ? [0, 1] : facingDir(ctx.rotation.y);
        const r = saveTrack(name, ctx.edit, ctx.region, dir, v.anchor);
        yield;
        return `선로 "${name}" 저장: 폭 ${r.w}칸 × 길이 ${r.l}칸 × ${r.h}층. 철도 > 선로 모양에서 고르세요`;
    },
};
