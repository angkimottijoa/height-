# OSM → 마크 도시 (1:1, 역 기준 정렬)

```
python3 tools/city/osm_city.py map.osm --station 東京 --out tools/city/out/tokyo
```

- 원점 = 역(JR `railway=station` 노드), 1블록 = 1m.
- 역의 지상 선로 방향이 마크 Z축에 오도록 회전합니다(북쪽 끝 = -Z). `--north`면 회전 없이 진북 = -Z, `--angle`로 직접 지정.
- 내보낸 영역(bounds) 밖으로 뻗은 도로·선로는 경계에서 자릅니다.
- 결과: `<out>.json` (건물 외곽선·높이, 도로 중심선·폭·교량/터널, 철도, 승강장, 물, 녹지 — 블록 좌표) 와 `<out>.png` (위에서 본 그림, 1픽셀 = 1블록, 빨간 원 = 역 원점).
- 건물 높이: `height` → `building:levels × 3.5m` → 없으면 14m 추정(`est: true`).

지도 데이터 © OpenStreetMap contributors (ODbL).
