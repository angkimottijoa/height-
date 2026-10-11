# 작업 규칙

- 사용자와는 한국어로 대화합니다.
- **에디터 DLC** (`dist/EditorDLC_V<버전>.mcaddon`, 디버그 스틱 + 아르세온 DLC + 구조물 통합팩):
  수정해서 내보낼 때마다 버전을 0.1씩 올립니다 → `python3 tools/integrated/build.py --bump`
  (버전은 `tools/integrated/VERSION`, README와 `docs/EDITOR_DLC.md`의 파일 이름도 같이 맞춥니다).
