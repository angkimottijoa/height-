# 에디터 DLC

`dist/EditorDLC_V<버전>.mcaddon` — 행동 팩 1개 + 리소스 팩 1개. MCBE **1.26.40 이상**.

**버전:** 지금 **V0.7**. 고칠 때마다 0.1씩 올립니다(V0 → V0.1 → V0.2 …). 게임 안 팩 이름에 버전이 보이고,
새 버전을 가져오면 같은 팩이 업데이트됩니다(예전 버전 파일은 지워도 됩니다).

| 들어 있는 것 | 쓰는 법 | 설명서 |
|---|---|---|
| 디버그 스틱 + 독립형 블록 333종 + 독립형 철문 | `/give @s vyt:debug_stick`, `/give @s vyt:ds_iron_door` | [DEBUG_STICK.md](DEBUG_STICK.md) |
| 자유 각도 회전(디버그 스틱 쪽, 나무 도끼) | `/vyt:copy` `/vyt:rotate` `/vyt:paste` `/vyt:spin` `/vyt:undo` | [DEBUG_STICK.md](DEBUG_STICK.md) |
| 아르세온 DLC (8Crafter's Server Utilities 확장) | `/arc:tools`, `/arc:menu` | [ARCEON_DLC.md](ARCEON_DLC.md) |
| 주얼 창이 다이아그리드 구조물 | `/function diagrid/build` | 아래 |
| 코쿤 타워 구조물 | `/function ctw4/build` | 아래 |

행동 팩과 리소스 팩은 서로 연결돼 있어서 **하나만 켜도 둘 다 같이 켜집니다**(같은 아이콘, `에디터 DLC V… (행동)` / `(리소스)`).

**따로 받은 Debug Stick / Arceon DLC / Jewel Diagrid / Cocoon Tower 팩과 예전 "통합팩"은 월드에서 빼고 이것만 적용하세요.**
같은 블록 ID와 명령어를 두 팩이 같이 등록하면 충돌합니다. 8Crafter's Server Utilities는 그대로 같이 써도 됩니다.

## 구조물

구조물은 스크립트와 상관없이 **함수로만** 소환합니다(치트 필요). 서 있는 칸이 구조물의 −X/−Z 아래 모서리가 되고,
+X/+Z/위쪽으로 지어집니다. 지을 자리가 로드돼 있어야 합니다.

| 함수 | 내용 |
|---|---|
| `/function diagrid/build` | 주얼 창이 다이아그리드 전체 (171 × 46 × 228, 철 블록 + 청록 색유리) |
| `/function diagrid/p01` ~ `p12` | 렉이 심하면 12조각으로 나눠 짓기 |
| `/function diagrid/clear` | 다이아그리드 자리 비우기 (지형 삭제, 되돌리기 불가) |
| `/function ctw4/build` | 코쿤 타워 (52 × 203 × 59) |
| `/function ctw4/clear` | 코쿤 타워 자리 비우기 (지형 삭제, 되돌리기 불가) |

- 다이아그리드의 빈 공간은 구조물 공기(structure void)라 주변 지형을 지우지 않습니다.
- 코쿤 타워는 빈 칸도 **공기**로 저장돼 있어서, 52 × 203 × 59 상자 안의 기존 블록을 지웁니다.
  높이가 203칸이므로 y = 117 아래에서 소환해야 꼭대기가 잘리지 않습니다(월드 높이 320 기준).
- 구조물 블록으로 직접 놓을 때 이름: `diagrid:a1` ~ `diagrid:c4`, `ctw4:tower`.

## 다시 만들기 (개발자용)

```
python3 tools/integrated/build.py          # packs/DebugStickBP·RP + packs/ArceonDLC_BP + packs/StructuresBP → dist/EditorDLC_V<버전>.mcaddon
python3 tools/integrated/build.py --bump   # 버전 +0.1 하고 빌드 (수정해서 내보낼 때마다)
```

스크립트는 `scripts/debugstick/`, `scripts/arceon/` 로 나뉘어 들어가고 `scripts/main.js` 하나가 둘 다 불러옵니다.
