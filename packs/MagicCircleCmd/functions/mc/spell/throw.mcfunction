# 자동 생성 파일 — 직접 수정하지 마세요.
# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.
# 발사체 방식 (로컬 좌표 ^ 없이 동작하는 대안)
# 이 함수는 발사 준비 연출만 하고, 실제 궤적은 던진 눈덩이를
# tick.json이 매 틱 따라다니며 그립니다. (/give @s snowball 로 준비)
function mc/cast
particle minecraft:knockback_roar_particle ~ ~1.2 ~
playsound beacon.activate @a ~ ~ ~ 1 1.6
