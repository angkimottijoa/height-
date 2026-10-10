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
    { id: 'curve', name: '곡선 도구', desc: '지팡이로 찍은 점을 잇는 곡선을 따라 만듭니다', icon: 'textures/blocks/gravel' },
    { id: 'shape', name: '형태 도구', desc: '로프트·회전체·구', icon: 'textures/items/amethyst_shard' },
    { id: 'transform', name: '변형 도구', desc: '자유 회전·크기 조절·문지르기', icon: 'textures/items/compass_item' },
    { id: 'terrain', name: '지형 도구', desc: '지형 생성·부드러운 눈', icon: 'textures/blocks/grass_side_carried' },
    { id: 'replace', name: '채우기 · 교체', desc: '패턴 채우기, 종류/색 바꾸기', icon: 'textures/items/bucket_empty' },
];

const T = (mod, group) => Object.assign(Object.create(mod.default), { group, module: mod });

export const TOOLS = [
    T(road, 'curve'), T(arch, 'curve'), T(roof, 'curve'), T(spike, 'curve'), T(dashes, 'curve'), T(river, 'curve'),
    T(loft, 'shape'), T(revolve, 'shape'), T(axisrevolve, 'shape'), T(icosphere, 'shape'),
    T(rotate, 'transform'), T(resize, 'transform'), T(smear, 'transform'),
    T(terragen, 'terrain'), T(smoothsnow, 'terrain'),
    T(fill, 'replace'), T(typereplace, 'replace'), T(colorreplace, 'replace'),
    T(text, 'text'), T(assets, 'assets'),
];

export const BRUSHES = [bBoulder, bCube, bSpike, bErode, bRevolve, bVine, bCrop].map(m => m.default);
