# 마인크래프트 베드락 높이 제한 팩 — 수정 + 지형 유지 검증

`8Crafter's World Height Limit Modifier` 팩의 수정 빌드와, **"높이 확장 + 지형 유지"가
실제로 가능한지 판별하는 진단 팩**입니다.

> **[에디터 DLC](docs/EDITOR_DLC.md)** — `dist/EditorDLC_V3.0.mcaddon`. 디버그 스틱 + 아르세온 DLC + 구조물(주얼 창이 다이아그리드, 코쿤 타워)을 한 팩으로.
>
> 별개의 애드온: **[디버그 스틱 + 독립형 블록](docs/DEBUG_STICK.md)** — `dist/DebugStick.mcaddon`.
> 바닐라 블록을 받침·이웃과 상관없이 모양을 고정하는 블록 333종 + 멀리서도 안 사라지는 철문.
>
> 별개의 애드온: **[아르세온 DLC](docs/ARCEON_DLC.md)** — `dist/ArceonDLC.mcaddon`.
> 8Crafter's Server Utilities용 확장. 아르세온 건축 도구(도로·아치·지붕·로프트·지형 생성·텍스트·에셋·브러시 등) + 1° 단위 자유 회전.
>
> 별개의 애드온: **[마법진](docs/MAGIC_CIRCLE.md)** — 바닥 마법진 + 상승 나선 + 시선 방향 빔.
> 명령어·바닐라 파티클 방식(`dist/MagicCircleCommands.mcpack`, 리소스팩 불필요)과
> 커스텀 파티클 방식(`dist/MagicCircle.mcaddon`) 두 가지.

## 지금 할 일 (요약)

| 파일 | 용도 |
|---|---|
| `dist/HeightLimitTest.mcpack` | **먼저 이걸 테스트.** 새 월드에서 2분이면 결론이 납니다 |
| `dist/CraftersWorldHeightLimitModifier.v.1.0.2.fixed.mcpack` | 실사용 팩 (높이 제한 정상 동작) |

---

## 1. 문제의 핵심

이 팩은 베드락의 `minecraft:dimension_bounds`로 오버월드 높이 범위를 바꿉니다.
그런데 MS 공식 문서의 **예제 코드**가 이렇게 되어 있습니다.

```json
"minecraft:dimension_bounds": { "min": -16, "max": 256 },
"minecraft:generation":       { "generator_type": "void" }
```

`generator_type: "void"`는 **아무 지형도 생성하지 않는** 생성기입니다. 그래서 팩이 켜진
상태에서 새로 생성되는 청크가 전부 공허가 됩니다. 첫 스크린샷(Y=-404 허공)이 이 증상입니다.

인터넷의 거의 모든 자료가 *"높이를 바꾸려면 void 생성기가 반드시 따라와야 한다"* 고
말합니다. **하지만 이건 문서 예제를 그대로 옮긴 것일 뿐입니다.**

### 공식 스키마를 직접 확인한 결과

MS의 dimension 컴포넌트 레퍼런스(`minecraft:components`)에는 이렇게 되어 있습니다.

| 컴포넌트 | 필수 여부 | 기본값 |
|---|---|---|
| `minecraft:dimension_bounds` | **optional** | *not set* |
| `minecraft:generation` | **optional** | *not set* |
| └ `generator_type` | — | ***not set*** |

즉 **`minecraft:generation`은 생략 가능한 선택적 컴포넌트**이고, 생략하면
`generator_type`은 *not set* — 다시 말해 **그 차원의 기본 생성기(오버월드 = 정상 지형)**
가 쓰일 여지가 있습니다. 실제로 같은 문서는 네더/엔드 설명에서
*"이 차원들에서는 `minecraft:dimension_bounds` 섹션을 제거하라"* 고 안내하는데,
이는 컴포넌트를 개별적으로 빼는 것이 정상적인 사용법임을 보여줍니다.

**문서 어디에도 "generation을 생략하면 안 된다"는 서술은 없습니다.**
그래서 `dimension_bounds`만 남기고 `minecraft:generation`을 통째로 빼면
지형을 유지한 채 높이만 늘릴 수 있는지 — 이건 실제로 확인해 볼 가치가 있습니다.

---

## 2. 진단 팩 사용법 (`HeightLimitTest.mcpack`)

> 반드시 **새 테스트 월드**에서 하세요. 본 월드에 적용하지 마세요.

1. `HeightLimitTest.mcpack` 실행 → 설치
2. **새 크리에이티브 월드** 생성 (월드 유형: 무한), 비헤이비어 팩에서 이 팩 적용
3. 서브팩 목록에서 **`A -64~512 generation 없음`** 선택 후 월드 생성
4. 들어가서 두 가지만 확인:
   - **지형이 있는가?** (산·나무·물이 보이는지)
   - **Y=330쯤까지 날아올라 블록이 설치되는가?** (바닐라 한계는 320)

### 결과 해석

| A 결과 | 의미 | 다음 |
|---|---|---|
| 지형 O + 320 위 설치 O | **성공.** void 없이 높이 확장 가능 | 알려주시면 본 팩 전체를 이 방식으로 재빌드하겠습니다 |
| 지형 O + 320 위 설치 X | bounds가 무시됨 → void가 실제로 필수 | 아래 3번(실사용 팩 + 사전 생성)으로 진행 |
| 지형 X (공허) | generation 생략해도 void와 동일 | 아래 3번으로 진행 |

`B`(void, 기존 동작)와 `C`(-512~512, generation 없음)는 비교·교차 확인용입니다.
`B`는 반드시 "높이는 늘어나지만 지형은 공허"로 나와야 정상이며, 이게 대조군입니다.

**결과 스크린샷 한 장만 보내주시면 그에 맞춰 본 팩을 다시 만들겠습니다.**

---

## 3. 실사용 팩 (`v.1.0.2.fixed`)

진단 결과와 무관하게, **현재 확실히 동작하는** 버전입니다.

### 권장 설정: `-512~512`가 아니라 `-64 to 512`

첫 스크린샷에서 Y=-404에 떠 계셨던 건 `min = -512`인 서브팩을 고르셨기 때문입니다.
바닥까지 내릴 이유가 없다면 **`-64 to 512`** 를 쓰세요.

- 바닥이 바닐라(-64) 그대로라 기존 지형·동굴이 영향을 덜 받습니다
- 위쪽으로만 512까지 확장됩니다
- 범위가 좁을수록 메모리 사용량도 적습니다

### 지형 손실을 피하는 순서 (중요)

공식 문서 기준으로, 팩이 켜진 동안 **새로 생성되는** 청크만 공허가 됩니다.
**이미 탐험해서 저장된 청크는 삭제되지 않고, 범위를 다시 넓히거나 팩을 끄면 돌아옵니다.**

1. 월드를 **백업**합니다
2. 팩을 **끈 상태로** 시야 거리를 최대로 올리고 건축할 지역을 미리 돌아다닙니다
   (청크가 생성·저장됨)
3. 그 다음 팩을 켜고 `-64 to 512`를 선택해 건축합니다
4. 팩이 켜진 동안에는 **새 지역으로 탐험하지 않습니다**
5. 되돌리려면 `OFF` 서브팩을 고르거나 팩을 비활성화합니다

> 단, 이미 공허로 생성되어 **저장된** 청크는 팩을 제거해도 그대로 남습니다.
> 그래서 2번(사전 생성)이 중요합니다.

---

## 4. 수정 내역

### v1.0.1 — 높이 제한이 아예 안 걸리던 문제

지형 삭제를 막으려 `generator_type`을 `"void"` → `"overworld"`로 바꾼 것이 원인이었습니다.
`"overworld"`는 스키마에 없는 값이라 dimension 정의 전체가 무효 처리되어, 지형은 정상으로
보이지만 **높이 제한이 전혀 적용되지 않는** 상태가 됐습니다(Y=320에서 설치 불가).
전 서브팩을 `"void"`로 되돌려 정상화했습니다.

### 원본 팩에 있던 실제 결함들

- **16의 배수 규격 위반**: `412` / `-412` → `416` / `-416` 으로 교정.
  베드락은 `min`/`max`가 16의 배수여야 하므로 해당 서브팩 4개는 원래 동작하지 않았습니다.
- **범위 0인 무효 서브팩** `0-0`, `-64--64`, `-256--256` 제거 (최소 범위는 16)
- **manifest 참조 오류**: 실제 폴더는 `OFFS`인데 `OFFs`로 참조 / 존재하지 않는 `-80-366` 참조
- **중복 등록**: `-512-512`가 두 번, 그중 하나는 `"memory_tier": -9999999999999`
- **누락 등록**: 폴더는 있는데 목록에 없던 `-64--48`, `-64--32`, `-64--16` 추가
- **비표준 JSON**: manifest의 `/* */` 주석 전부 제거 → 순수 JSON으로 재작성

### v1.0.2

- 빈 `OFFS` 폴더가 git에 저장되지 않아 클론 후 재빌드 시 OFF 옵션이 사라지던 문제 수정
- `[실험]` 서브팩 3종(generation 생략 변형)을 목록 상단에 배치

manifest의 서브팩 목록과 실제 폴더가 **정확히 1:1로 일치**하며(148개), 전 파일이
16의 배수·범위 16~1024·`-512~512` 규격을 통과합니다.

---

## 저장소 구조

- `packs/CraftersWorldHeightLimitModifier/` — 실사용 팩 소스
- `packs/HeightLimitTest/` — A/B 진단 팩 소스
- `packs/MagicCircleCmd/` — 마법진: 명령어·바닐라 파티클 방식 ([문서](docs/MAGIC_CIRCLE.md))
- `packs/MagicCircleRP/`, `packs/MagicCircleBP/` — 마법진: 커스텀 파티클 방식
- `tools/` — 마법진 생성기 / 빌드·검증 스크립트
- `dist/` — 설치용 `.mcpack` · `.mcaddon` 빌드 결과물

## 참고 자료

- [Data Driven Overworld Height and Void Generation | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/documents/datadrivenoverworldheight?view=minecraft-bedrock-stable)
- [Dimensions Documentation — minecraft:components | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/dimensionreference/examples/dimensioncomponents/components?view=minecraft-bedrock-stable)
- [Dimensions Documentation — minecraft:bounds | Microsoft Learn](https://learn.microsoft.com/en-us/minecraft/creator/reference/content/dimensionreference/examples/dimensioncomponents/bounds?view=minecraft-bedrock-stable)
- [World Height Limit Modifier | 8Crafter Wiki](https://wiki.8crafter.com/main/add-ons/world-height-limit-modifier)
