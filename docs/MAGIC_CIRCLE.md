# 마법진 (Bedrock)

바닥에 그려지는 마법진 + 상승 나선 + 시선 방향 빔. **두 가지 방식**이 들어 있습니다.

| | A. 명령어 + 바닐라 파티클 | B. 커스텀 파티클 리소스팩 |
|---|---|---|
| 파일 | `dist/MagicCircleCommands.mcpack` | `dist/MagicCircle.mcaddon` |
| 리소스팩 | **필요 없음** | 필요 (텍스처 포함) |
| 문양 | 파티클 점으로 그린 기하 도형 | 텍스처라 룬·칠각성이 선명 |
| 움직임 | 상승 나선, 빔, 충격파 링 | 링 3겹이 서로 반대로 회전 |
| 멀티/서버 | 비헤이비어팩만 있으면 전원에게 보임 | 접속자 모두 리소스팩 필요 |
| 지름 | 약 10블록 | 약 5블록 |

영상처럼 **빔·궤적·충격파**가 필요하면 A, 바닥 문양의 선명함이 중요하면 B,
둘 다 켜도 충돌하지 않습니다.

---

# A. 명령어 방식 (바닐라 파티클, 리소스팩 불필요)

## 1. 설치

1. `dist/MagicCircleCommands.mcpack` 실행 → 가져오기
2. 월드 설정 → **비헤이비어 팩**에서 `마법진 (명령어/바닐라 파티클)` 적용
3. 월드 설정에서 **치트 허용(Cheats)** 켜기
4. 월드 입장 후 **딱 한 번** 실행:

```
/function mc/init
```

> `mc/init`은 스코어보드 2개(`mc_t`, `mc_life`)를 만듭니다. 월드당 한 번이면 됩니다.

## 2. 명령어

```
/function mc/cast            그 자리에 마법진 (10초 후 사라짐)
/function mc/place           계속 유지되는 마법진 (mc/stop 으로 제거)
/function mc/follow          나를 따라다니는 마법진  ← 영상 느낌
/function mc/unfollow        따라다니기 끄기
/function mc/stop            모든 마법진 제거
/function mc/draw            1회만 그리기 (회전/나선 없음, 명령 블록용)

/function mc/spell/beam      시선 방향으로 빔 발사
/function mc/spell/cast      마법진 + 빔 + 소리 (전체 연출)
/function mc/spell/throw     발사 준비 연출 (눈덩이를 던지면 궤적이 따라붙음)
```

채팅에서 직접 치면 실행자가 본인이라 그대로 동작합니다.
**명령 블록**에서 쓸 때는 시전자를 지정해야 합니다.

```
/execute as @p at @s run function mc/spell/cast
/execute positioned 100 64 -30 run function mc/place
```

### 눈덩이 궤적

팩이 켜져 있으면 **던진 눈덩이**에 자동으로 나선 궤적과 충격파 링이 붙습니다.
`/give @s snowball 16` 으로 받아서 던져 보세요. 빔과 달리 실제로 날아가고
엔티티에 맞습니다.

## 3. 구성 (쓰는 바닐라 파티클)

| 파티클 | 쓰이는 곳 |
|---|---|
| `minecraft:endrod` | 원·칠각성·룬 눈금 등 모든 흰 선, 중앙 기둥 |
| `minecraft:blue_flame_particle` | 상승 나선 3줄, 사방위 노드 |
| `minecraft:snowflake_particle` | 빔 본체, 눈덩이 궤적의 푸른 입자 |
| `minecraft:knockback_roar_particle` | 퍼져나가는 흰 충격파 링 |
| `minecraft:critical_hit_emitter` | 발동 순간 스파크 |

전부 [Bedrock Wiki](https://wiki.bedrock.dev/particles/vanilla-particles)가
"문제 없이 소환됨"으로 분류한 것만 씁니다. (`basic_crit_particle`,
`electric_spark_particle`, `enchanting_table_particle`, `soul_particle` 등은
콘텐츠 로그 에러를 뿜어서 쓰지 않았습니다.)

### 도형 구성

- 바깥 원 `r=5.0` (128점) + 둘째 원 `r=4.55` (96점)
- 룬 눈금 24개 (`r=3.95~4.40`)
- 칠각성 {7/3} `r=3.6`
- 안쪽 원 `r=1.55`, 중앙 빛기둥 4.4블록
- 파란 나선 3줄이 `r=2.2 → 0.9` 로 좁아지며 4.5블록까지 상승

## 4. 이 방식의 원리와 한계

바닐라 파티클은 **수명을 제어할 수 없습니다**(약 2초). 그래서:

- **회전시키면 잔상이 남아 문양이 뭉개집니다.** 그래서 도형은 돌리지 않고,
  점을 8개 프레임에 나눠서(위상 분할) 그립니다. 프레임이 합쳐지면 정확히
  원래 도형이 되고, 한 바퀴(16틱 = 0.8초)가 수명보다 짧아 끊기지 않습니다.
- 움직임은 **상승 나선 · 빔 · 충격파 링**이 담당합니다.
- 부하: 프레임당 약 66개 명령, 2틱마다 실행 → **초당 약 330 파티클**.
  무겁다면 `tools/gen_magic_circle_commands.py`의 점 개수를 줄이고 다시 생성하세요.

> **빔은 로컬 좌표(`^`)를 씁니다.** `execute ... rotated as @s positioned ^ ^ ^12`
> 형태라 1.19.50 이후 문법이 필요합니다. 구버전이라 빔이 안 나오면
> `mc/spell/throw` + 눈덩이 궤적 방식을 쓰세요 (로컬 좌표를 쓰지 않습니다).

## 5. 커스터마이징

`tools/gen_magic_circle_commands.py` 위쪽 상수만 고치고 다시 생성하면 됩니다.

```
python3 tools/gen_magic_circle_commands.py   # .mcfunction 재생성
python3 tools/build_magic_circle.py          # 검증 후 dist/ 재빌드
```

| 상수 | 뜻 |
|---|---|
| `R_OUTER`, `R_INNER_RING` | 바깥/둘째 원 반지름 (기본 5.0 / 4.55) |
| `DASH_SLOTS` | 룬 눈금 개수 (24) |
| `STAR_N`, `STAR_STEP` | 별 다각형. `(7,3)` 칠각성, `(5,2)` 오각성 |
| `VORTEX_STRANDS`, `VORTEX_TOP` | 나선 줄 수 / 높이 |
| `BEAM_TO`, `BEAM_STEP` | 빔 길이 / 점 간격 |
| `SWEEP` | 도형을 몇 프레임에 나눠 그릴지 (클수록 가벼움) |
| `LINE`, `ACCENT`, `MOTE`, `RING` | 각 역할에 쓰는 파티클 ID |

**색을 바꾸려면** 파티클 ID를 바꾸세요. 바닐라 파티클은 색 지정이 불가능합니다.

- 붉게: `ACCENT = "minecraft:basic_flame_particle"`, `MOTE = "minecraft:lava_particle"`
- 보라: `MOTE = "minecraft:basic_portal_particle"`
- 초록: `MOTE = "minecraft:villager_happy"`

임의의 색이 필요하면 **B(커스텀 파티클)** 쪽을 쓰는 편이 낫습니다. 거기선
텍스처가 흰색이라 tinting으로 아무 색이나 지정됩니다.

수명(기본 10초)은 `packs/MagicCircleCmd/functions/mc/expire.mcfunction`의
`200`(틱)을 고치세요.

## 6. 명령 블록만으로 쓰기

팩 없이 쓰고 싶으면 `dist/magic-circle-commands.txt`에 정적 마법진 명령
432줄이 상대 좌표로 들어 있습니다. 다만 채팅에 한 줄씩 넣는 건 비현실적이라
**팩 + `/function mc/draw`** 를 권장합니다. 반복 명령 블록에 넣을 때는

- 반복 / 항상 활성 / 지연 **30틱**
- `execute positioned 100 64 -30 run function mc/draw`

---

# B. 커스텀 파티클 방식 (리소스팩)

텍스처를 직접 생성해 쓰는 버전입니다. 룬 24자와 칠각성이 **이미지로** 들어가
있어서 훨씬 선명하고, 링 3겹이 서로 반대 방향으로 회전합니다.
(텍스처 3겹을 실제 크기 비율로 합성한 그림: `docs/magic-circle-preview.png` —
게임 스크린샷이 아니라 텍스처 확인용입니다.)

## 설치

`dist/MagicCircle.mcaddon` 실행 → **리소스팩 + 비헤이비어팩** 둘 다 적용 →
월드 재진입.

## 사용

```
/function magic/cast      전체 연출 (충격파 + 폭발 + 마법진 + 빛기둥)
/function magic/circle    마법진 3겹 + 상승 입자
/function magic/burst     발동 순간만
/particle magic:circle_outer ~ ~ ~     레이어 개별 호출
```

| 식별자 | 역할 | 지속 | 크기 |
|---|---|---|---|
| `magic:circle_outer` | 바깥 이중 링 + 눈금, 시계방향 9°/s | 8초 | 지름 5.2블록 |
| `magic:circle_runes` | 룬 24자 띠, 반대방향 -15°/s | 8초 | 지름 4.2블록 |
| `magic:circle_sigil` | 칠각성·오각성 문양, 24°/s + 맥동 | 8초 | 지름 2.5블록 |
| `magic:circle_sparks` | 바깥 링에서 피어오르는 불티 | 8초 | 반경 2.4블록 |
| `magic:circle_pillar` | 중앙에서 상승하는 빛 입자 | 8초 | 반경 1.15블록 |
| `magic:circle_beam` | 중앙 빛기둥 | 8초 | 높이 4.4블록 |
| `magic:circle_shock` | 퍼져나가는 충격파 링 | 1.1초 | 0.5 → 4.5 |
| `magic:circle_burst` | 사방으로 튀는 스파크 | 1.2초 | — |

## 색 바꾸기

`packs/MagicCircleRP/particles/*.json` →
`minecraft:particle_appearance_tinting`의 `gradient` 값 `[R, G, B, A]`(0~1).
텍스처가 **흰색 + 알파**라서 여기서 지정한 색이 그대로 나옵니다.

```jsonc
"0.20": [ 0.40, 0.85, 1.00, 0.85 ]   // 기본: 하늘색
"0.20": [ 1.00, 0.25, 0.30, 0.85 ]   // 붉은 마법진
"0.20": [ 0.75, 0.35, 1.00, 0.85 ]   // 보라 마법진
```

## 크기 / 지속 시간

`minecraft:particle_appearance_billboard`의 `size`는 **반지름**입니다(2.6 → 지름 5.2).
3겹을 함께 키울 때는 비율을 유지하세요 (`2.60 : 2.10 : 1.25`).
지속 시간은 `emitter_lifetime_once.active_time`과
`particle_lifetime_expression.max_lifetime`을 **같은 값으로** 바꿔야 합니다.

## 문양 바꾸기

텍스처는 `tools/gen_magic_circle_textures.py`가 SDF로 직접 그립니다(의존성 없음).
`RUNES`(룬 획 목록), `tex_outer`/`tex_runes`/`tex_sigil`,
`star_points(cx, cy, r, n, step)`을 고치고 재생성하세요.

---

## 문제 해결

| 증상 | 해결 |
|---|---|
| 아무것도 안 보임 (A) | 치트 허용 ON, `/function mc/init` 실행, 비헤이비어팩 적용 확인 |
| 아무것도 안 보임 (B) | 리소스팩 적용 후 **월드 재진입** |
| 파티클이 듬성듬성 | 설정 → 비디오 → **파티클**을 '전체(All)'로 |
| `/function mc/...` 인식 안 됨 | 비헤이비어팩이 이 월드에 적용되지 않음 |
| 빔이 안 나감 | 구버전이라 `^` 미지원일 수 있음 → `mc/spell/throw` + 눈덩이 |
| 마법진이 남아서 안 지워짐 | `/function mc/stop` |
| 공중에 이름표가 보임 | 구버전 팩. 현재 버전은 이름 없는 갑옷 거치대 + 태그를 씁니다 |
| 렉 | `SWEEP` 값을 키우거나 원의 점 개수를 줄여 재생성 |
| 경사면에서 잘림 | 평면 도형이라 지형을 따라가지 않습니다. 평지 권장 |

## 저장소 구조

```
packs/MagicCircleCmd/     A: 명령어 팩 (전부 자동 생성)
packs/MagicCircleRP/      B: 커스텀 파티클 + 텍스처
packs/MagicCircleBP/      B: 소환 함수
tools/gen_magic_circle_commands.py   A 생성기
tools/gen_magic_circle_textures.py   B 텍스처 생성기
tools/build_magic_circle.py          검증 + 패키징
```

빌드 스크립트가 zip 전에 검사하는 것:

- 커스텀 파티클 JSON 문법·식별자 중복, 텍스처 존재, **PNG 실제 크기와 `uv` 일치**
- `.mcfunction`이 부르는 **파티클 ID가 바닐라 목록에 있는지**, 함수·소리 이름이 실재하는지
- `tick.json`이 가리키는 함수 존재, 스코어보드가 `mc/init`에서 생성되는지
- 저장소 전체 manifest UUID 중복

## 참고 자료

- [Vanilla Particles | Bedrock Wiki](https://wiki.bedrock.dev/particles/vanilla-particles)
- [Particles Documentation | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/particlesreference/examples/particlesintroduction?view=minecraft-bedrock-stable)
- [Molang Documentation | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/molangreference/examples/molangconcepts/molangintroduction?view=minecraft-bedrock-stable)
