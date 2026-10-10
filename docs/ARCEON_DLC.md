# 아르세온 DLC (8Crafter's Server Utilities 확장)

`dist/ArceonDLC.mcaddon` — 행동 팩 1개(리소스 팩 없음). MCBE **1.26.40 이상**.

Java 플러그인 **Arceon 0.5.6**(Arcaniax)의 건축 도구를 뜯어서 베드락 스크립트로 옮긴 애드온입니다.
서버에 이미 들어가 있는 **8Crafter's Server Utilities & Debug Sticks**와 같이 쓰는 확장(DLC)으로 만들었고,
그 팩의 선택 도구로 찍은 pos1/pos2를 그대로 따라옵니다. 8Crafter 팩이 없어도 단독으로 동작합니다.

그림자(Shadow)·로프(Rope)·실험적 도구(Wax, FixConnect, WFC)는 요청대로 넣지 않았습니다.

## 시작하기

1. 월드(서버)에 `ArceonDLC.mcaddon`의 행동 팩을 추가합니다. 실험적 기능은 필요 없습니다.
2. 관리자(OP)이거나 `arceon` 태그가 있어야 합니다. (`/tag <이름> add arceon`)
3. `/arc:wand` 로 **아르세온 지팡이**(블레이즈 막대 모양)를 받습니다.
4. 지팡이를 들고 **웅크리고 우클릭** 하거나 `/arc:menu` 로 메뉴를 엽니다.

| 명령어 | 내용 |
|---|---|
| `/arc:menu` | 메뉴 |
| `/arc:wand` | 지팡이 받기 |
| `/arc:undo` / `/arc:redo` | 되돌리기 / 다시 하기 (플레이어마다 15번) |

## 지팡이와 선택 영역

| 지팡이 모드 | 좌클릭(블록 치기) | 우클릭(사용, 300칸까지) |
|---|---|---|
| **점** (기본, 곡선 도구용) | 점 초기화 + 첫 점 | 점 추가 |
| **영역** | pos1 | pos2 |
| **로프트 프레임** | 새 프레임 + 첫 점 | 마지막 프레임에 점 추가 |

- 지팡이를 들고 있으면 점(초록), 곡선(불꽃), 로프트 프레임(파란 불꽃), 영역 테두리(엔드 막대)가 입자로 보입니다.
- **8Crafter 선택 도구**로 찍은 pos1/pos2가 자동으로 따라옵니다. (그 팩의 저장값은 다른 팩이 읽을 수 없어서,
  선택 도구를 쓸 때마다 같은 방식으로 따라 기록합니다. `\pos1` 같은 8Crafter 명령어로 지정한 값은 따라오지 않으니
  그때는 메뉴 > 선택 영역 에서 지정하세요.)
- 메뉴 > 선택 영역 · 점: 지팡이 모드, pos1/pos2를 내 위치로, 좌표 직접 입력, 마지막/가장 가까운 점 지우기.
- 곡선 도구에 점이 없으면 아르세온처럼 pos1 → pos2 를 잇는 선을 씁니다.

## 입력 폼

8Crafter 폼처럼 간단하게 만들었습니다. 모든 블록 입력은

- **블록 소스**: 직접 입력 / 손에 든 블록 / 바라보는 블록 / 핫바 블록 섞기 / 저장한 팔레트
- **블록 ID / 패턴**: `stone`, `50%stone,andesite`, `oak_slab`, `oak_stairs[weirdo_direction=2]`, `#turb[10][red_wool,blue_wool]` …
- **직접 입력을 새 팔레트로 저장** 토글

각도는 슬라이더로 몇 도인지 보면서 고르고, 아르세온의 플래그(-n, -d, -p …)는 설명이 붙은 토글입니다.
마지막에 입력한 값은 도구마다 기억됩니다.

**반블록(슬랩) 패턴**이면 도로·아치·지붕·점선·로프트·지형 생성·텍스트가 아르세온처럼 반 칸 단위로 다듬고,
`snow_layer` 패턴이면 눈 층, `water` 이면 물 높이로 다듬습니다.

## 도구

| 메뉴 | 도구 | 선택 | 아르세온 명령어 |
|---|---|---|---|
| 곡선 | 도로 | 점 | `//road <블록> <폭> [높이] -n -d -p` |
| 곡선 | 아치 | 점 | `//arch <블록> <폭> [높이] [기둥] [개수] [아치높이%] -l -d -p` |
| 곡선 | 지붕 | 점 | `//roof <블록> <폭> [높이] -n -d -b -h -p` |
| 곡선 | 가시 | 점 | `//spike <블록> <크기1> <크기2> [크기3] -n -p` |
| 곡선 | 점선 | 점 | `//dashes <블록> <선> <빈칸> [폭] -d -s` |
| 곡선 | 강 | 점 | `//river <블록> <시작> <끝> [경사] -s -n` |
| 형태 | 로프트 | 프레임 | `//loft set <패턴> [개수] -p -o -c -d` (+ clear / remove / remove -c) |
| 형태 | 회전체 | 영역 | `//revolve <개수> [시작] [끝] [높이차] -p -r -s` |
| 형태 | 축 회전체 | 영역 | `//axisrevolve` (축 = 내 위치 → 바라보는 블록) |
| 형태 | 아이코스피어 | 내 위치 | `//icosphere <블록> <크기> [세분화] -l` |
| 변형 | **자유 회전** | 영역 | 월드에딧 `//rotate` 방식, Y/X/Z 1° 단위 |
| 변형 | 크기 조절 | 영역 | `//resize <배율> -a` |
| 변형 | 문지르기 | 영역 | `//smear [거리] [방향] -r` (전역 마스크 = `//gsmask`) |
| 지형 | 지형 생성 | 영역 | `//terragen [종류] [패턴] [높이] [확대] [물결] -s -v -e -r -n` + 시드(`//tgseed`) |
| 지형 | 부드러운 눈 | 영역 | `//smoothsnow [부드러움] [마스크] [패턴] [추가높이] -o` |
| 채우기·교체 | 패턴 채우기 / 교체 | 영역 | 아르세온 마스크·패턴을 쓰는 `//set` / `//replace` |
| 채우기·교체 | 종류 바꾸기 | 영역 | `//typereplace <원래> <바꿀> -f -b -s -d` |
| 채우기·교체 | 색 바꾸기 | 영역 | `//colorreplace <원래> <바꿀> -b -g` |
| 텍스트 | 텍스트 | 내 위치·방향 | `//font`, `//text <블록> <크기> <글> -c` |
| 에셋 | 저장 / 고르기 / 배치기 / 삭제 | 영역 | `//ap save -c -f -t`, 배치기 아이템 |

### 자유 회전

- **좌우 회전 Y / 앞뒤 기울기 X / 옆 기울기 Z** 슬라이더(−180°~180°, 1° 단위)
- **제자리 회전**(원래 자리는 비움, 중심 = 영역 중심 또는 내가 선 칸) 또는 **돌린 복사본을 내 위치에 놓기**
- 계단·원목·문·표지판 등 방향이 있는 블록도 같이 돌아갑니다. 구멍 없이 채워집니다.

### 브러시 (메뉴 > 브러시)

**손에 든 아이템**에 브러시를 붙이고, 그 아이템으로 우클릭하면 바라보는 블록(300칸)에 적용됩니다.

바위, 큐브, 가시, 침식·블렌드(채우기/부드럽게/들어올리기/녹이기/지우기), 회전체(영역 사용), 덩굴, 작물.
크기 범위(`[min],[max]`)는 최소·최대 두 칸으로 입력합니다.

### 에셋

1. 영역을 잡고 저장할 때 **바라보는 블록이 기준점**이 됩니다(-c 가운데, -f 바닥).
2. 메뉴 > 에셋 > 배치할 에셋 고르기: 이름 여러 개(쉼표) = 놓을 때마다 무작위, 회전(바라보는 방향/무작위/없음), 뒤집기.
3. **에셋 배치기**(메아리 조각 모양)로 블록을 우클릭하면 놓입니다. 되돌리기 가능.

에셋은 월드의 구조물(`arc_asset:<이름>`)로 저장되어 서버를 다시 켜도 남습니다.

### 마스크 · 패턴

설정 > 전역 마스크(문지르기·채우기·브러시에 적용)와 패턴 채우기의 마스크 칸에서 씁니다.

- 마스크: `stone,dirt` `!air` `#existing` `#solid` `#arcangle[0][30][2]` `#prox[wool][5]` `#prox3D[..][..]`
  `#above[..][..]` `#below[..][..]` `y[45][50]` `#type[oak]` `#cc[red]` `#ambient` `#ygradient[10][20]`
  `#noise[시드][확대][비율]` `#turbulence` `#electric` `#crack` `#cell` `#voronoi` `#fractal` — 공백으로 여러 개 = 모두 만족
- 패턴: `50%stone,andesite` `oak_slab[top]` `#type[quartz]` `#cc[lime]` `#invert` `#blend` `#dp[0~5]`
  `#turb[크기][블록목록][시드]` `#elec` `#arcvor` `#frac` `#cell[크기][블록목록][지터]`

블록 이름은 베드락 ID입니다. 자주 쓰는 자바 이름(`bricks`, `end_stone_bricks`, `oak_door` …)도 알아듣습니다.

## 알아둘 점

- 큰 작업은 한 틱에 수천 블록씩 나눠 처리합니다. 작업 범위가 로드돼 있어야 하고(로드 안 된 곳은 건너뜀),
  한 번에 최대 200만 블록까지 바꿉니다.
- 되돌리기 기록은 메모리에 있어서 서버를 다시 켜면 사라집니다. 점·영역·브러시·설정은 저장됩니다.
- 표지판 글자, 상자 내용물 같은 블록 엔티티 데이터는 복사·회전되지 않습니다(블록 모양과 상태만).
- 색 바꾸기: 현수막·침대 색은 베드락에서 스크립트로 바꿀 수 없어 건너뜁니다. 내용물이 든 셜커 상자도 건너뜁니다.
- 종류 바꾸기: 표지판은 글자가 사라지므로 바꾸지 않습니다.
- 텍스트 글꼴은 아르세온에 들어 있던 11종을 미리 비트맵으로 변환했습니다. 아르세온의 unicode 글꼴(MS Mincho)에는
  **한글이 없어서** 한글은 WenQuanYi Zen Hei(GPL, 글꼴 포함 예외)로 그렸습니다. 작은 크기(14 미만)는 자바보다 거칠 수 있습니다.
- 지형 생성 노이즈는 아르세온의 FastNoise를 그대로 옮겨, 같은 시드면 자바와 같은 값이 나옵니다.
- 아르세온과 다르게 고친 점: 축 회전체의 뒤집힌 복사·1칸 밀림·시작 각도 무시 버그를 바로잡았고,
  지형 생성은 열마다 한 번만 쌓습니다(자바에서 -e를 쓰면 겹쳐 쌓이던 문제).
- 발광 이끼를 덩굴 브러시로 쓸 때 방향은 아직 게임에서 확인하지 못했습니다.

## 개발자용

```
python3 tools/arceon_dlc/gen_families.py <bedrock-samples>/metadata/vanilladata_modules/mojang-blocks.json packs/ArceonDLC_BP/scripts/core/families.js
python3 tools/arceon_dlc/gen_fonts.py <arceon 글꼴 폴더> packs/ArceonDLC_BP/scripts/fonts --hangul <wqy-zenhei.ttc>
python3 tools/arceon_dlc/schema_check.py <bedrock-samples>/metadata/json_schemas   # 아이템 파일 스키마 검사
python3 tools/arceon_dlc/package.py                                                 # dist/ArceonDLC.mcaddon
```

테스트(가짜 `@minecraft/server`로 실제 스크립트를 실행):

```
cd tools/arceon_dlc/jstest
python3 gen_defs.py <bedrock-samples>/metadata/vanilladata_modules/mojang-blocks.json defs.json
node main_test.mjs     # 지팡이·8Crafter 선택 연동·메뉴·도구·브러시·되돌리기
node curve_test.mjs; node shape_test.mjs; node terrain_test.mjs; node replace_test.mjs; node lead_test.mjs; node core_test.mjs
```

| 폴더 | 내용 |
|---|---|
| `scripts/core` | 벡터, 곡선(베지어), 노이즈, 블록·패턴·마스크, 편집 세션·되돌리기, 선택 영역, 회전 |
| `scripts/tools`, `scripts/brushes` | 도구 20종, 브러시 7종 (`tools/index.js`가 목록) |
| `scripts/lib` | 도구별 공용 코드 (FastNoise 이식 등) |
| `scripts/ui` | 폼, 메뉴, 입자 미리보기 |
| `scripts/fonts` | 미리 변환한 글꼴 비트맵 (필요할 때만 불러옴) |
