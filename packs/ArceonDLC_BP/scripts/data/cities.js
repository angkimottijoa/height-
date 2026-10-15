// The cities the city tool can build (data/city_<id>.js). Made by tools/city/pack_city.py.
import tokyo from './city_tokyo.js';
import shinjuku from './city_shinjuku.js';
import shibuya from './city_shibuya.js';
import umeda from './city_umeda.js';
export const CITIES = [
    { id: 'tokyo', name: '도쿄역', align: -17.47, data: tokyo },
    { id: 'shinjuku', name: '신주쿠역', align: 9.5, data: shinjuku },
    { id: 'shibuya', name: '시부야역', align: 17.53, data: shibuya },
    { id: 'umeda', name: '오사카역·우메다', align: 31.33, data: umeda },
];
