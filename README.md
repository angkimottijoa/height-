# 8Crafter's World Height Limit Modifier — 지형 삭제 버그 수정

이 저장소는 `v.1.0.0 8Crafter's World Height Limit Modifier` 비헤이비어 팩(`.mcpack`)의
"적용하면 기존 지형이 다 사라지는(공허가 되는) 버그"를 수정한 버전입니다.

## 원인

팩은 `subpacks/<min>-<max>/dimensions/overworld.json` 파일들로 오버월드 높이 범위
(`minecraft:dimension_bounds`)를 서브팩마다 다르게 설정합니다. 여기까지는 정상 동작입니다.

문제는 **모든 서브팩(147개)** 의 `overworld.json`에 아래처럼
지형 생성기 자체를 `void`(빈 공허)로 강제 지정해 놓았다는 점입니다.

```json
"minecraft:generation": {
  "generator_type": "void"
}
```

`generator_type: void`는 마인크래프트 베드락에서 "아무것도 생성하지 않는" 발전기입니다.
높이 제한 팩을 켜서 `dimension_bounds`(min/max)가 바뀌면 게임은 새 높이 범위에 맞춰
청크를 다시 생성해야 하는데, 이때 발전기가 `void`로 지정돼 있으니 원래 있던 산·동굴·바이옴
지형 대신 **빈 공간**이 만들어집니다. 사용자가 첨부한 스크린샷(플레이어가 Y=-404 허공에 뜬 채
주변에 아무 지형도 없고 조각난 블록만 남아있는 상태)이 정확히 이 증상입니다.

## 수정 내용

`packs/CraftersWorldHeightLimitModifier/subpacks/*/dimensions/overworld.json` 147개 파일
전부에서

```diff
- "generator_type": "void"
+ "generator_type": "overworld"
```

로 변경했습니다. `dimension_bounds`(min/max)는 그대로 유지되므로 원하는 높이 제한 효과는
동일하게 적용되고, 실제 지형 생성기(산, 동굴, 바이옴 등)는 정상적으로 작동합니다.

`OFFS` 서브팩(팩 효과 끄기 옵션)은 애초에 `dimensions/overworld.json`이 없어 바닐라 설정을
그대로 사용하므로 수정하지 않았습니다.

## 사용법

1. `dist/CraftersWorldHeightLimitModifier.v.1.0.0.fixed.mcpack` 파일을 기기에 내려받아
   실행하면 마인크래프트에 비헤이비어 팩으로 자동 설치됩니다.
2. 월드 설정 → 비헤이비어 팩에서 이 팩을 적용하고, 원하는 높이 범위의 서브팩을 선택합니다.
3. **주의**: 이미 이 팩(버그 버전)을 적용해서 지형이 삭제된 기존 월드는, 삭제된 청크가
   저장 파일에 "빈 공허"로 이미 기록되었기 때문에 이 수정판을 적용해도 되살아나지 않습니다.
   백업이 있다면 백업에서 복원한 뒤 수정판을 적용해 주세요. 새 월드나 아직 이 버그를
   겪지 않은 월드에는 정상적으로 적용됩니다.

## 저장소 구조

- `packs/CraftersWorldHeightLimitModifier/` — 수정된 팩 소스 (압축 해제된 형태)
- `dist/CraftersWorldHeightLimitModifier.v.1.0.0.fixed.mcpack` — 설치 가능한 빌드 결과물
