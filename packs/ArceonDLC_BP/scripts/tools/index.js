/*
 * Every tool and brush, grouped for the menu.
 */
import * as arch from './arch.js';
import * as assets from './assets.js';
import * as axisrevolve from './axisrevolve.js';
import * as colorreplace from './colorreplace.js';
import * as dashes from './dashes.js';
import * as fill from './fill.js';
import * as icosphere from './icosphere.js';
import * as lanes from './lanes.js';
import * as lanepreset from './lanepreset.js';
import * as loft from './loft.js';
import * as resize from './resize.js';
import * as revolve from './revolve.js';
import * as river from './river.js';
import * as road from './road.js';
import * as roof from './roof.js';
import * as rotate from './rotate.js';
import * as smear from './smear.js';
import * as smoothsnow from './smoothsnow.js';
import * as spike from './spike.js';
import * as surface from './surface.js';
import * as terragen from './terragen.js';
import * as text from './text.js';
import * as typereplace from './typereplace.js';
import * as bBoulder from '../brushes/boulder.js';
import * as bCrop from '../brushes/crop.js';
import * as bCube from '../brushes/cube.js';
import * as bErode from '../brushes/erodeblend.js';
import * as bRevolve from '../brushes/revolve.js';
import * as bSpike from '../brushes/spike.js';
import * as bVine from '../brushes/vine.js';

export const GROUPS = [
    { id: 'curve', name: '곡선 도구', desc: '선택 지팡이(곡선 점 모드)로 찍은 점들을 잇는 곡선을 따라 만듭니다', icon: 'textures/blocks/gravel' },
    { id: 'shape', name: '모양 만들기', desc: '회전 복제, 다면체 구', icon: 'textures/items/amethyst_shard' },
    { id: 'transform', name: '변형', desc: '자유 회전, 크기 조절, 끌어 늘리기', icon: 'textures/items/compass_item' },
    { id: 'replace', name: '채우기 · 바꾸기', desc: '패턴 채우기, 재질 바꾸기, 색 바꾸기', icon: 'textures/items/bucket_empty' },
    { id: 'frame', name: '프레임 채우기', desc: '프레임 피커로 찍은 프레임을 곡면 또는 평면으로 채웁니다', icon: 'textures/items/amethyst_shard' },
    { id: 'terrain', name: '지형', desc: '지형 생성, 눈 덮기', icon: 'textures/blocks/grass_side_carried' },
];

const T = (mod, group) => Object.assign(Object.create(mod.default), { group, module: mod });

export const TOOLS = [
    T(road, 'curve'), T(lanes, 'curve'), T(lanepreset, 'curve'), T(arch, 'curve'), T(roof, 'curve'), T(spike, 'curve'), T(dashes, 'curve'), T(river, 'curve'),
    T(revolve, 'shape'), T(axisrevolve, 'shape'), T(icosphere, 'shape'),
    T(rotate, 'transform'), T(resize, 'transform'), T(smear, 'transform'),
    T(fill, 'replace'), T(typereplace, 'replace'), T(colorreplace, 'replace'),
    T(loft, 'frame'), T(surface, 'frame'),
    T(terragen, 'terrain'), T(smoothsnow, 'terrain'),
    T(text, 'text'), T(assets, 'assets'),
];

export const BRUSHES = [bBoulder, bCube, bSpike, bErode, bRevolve, bVine, bCrop].map(m => m.default);
