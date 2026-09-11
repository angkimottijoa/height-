# 자동 생성 파일 — 직접 수정하지 마세요.
# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.
# 전체 시전: 발밑 마법진 + 빔 + 소리
#   /execute as @p at @s run function mc/spell/cast
function mc/cast
function mc/spell/beam
playsound beacon.activate @a ~ ~ ~ 1 1.4
playsound random.explode @a ~ ~ ~ 0.5 2.0
