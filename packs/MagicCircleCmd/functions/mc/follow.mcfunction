# 자동 생성 파일 — 직접 수정하지 마세요.
# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.
# 시전자를 따라다니는 마법진 ON (영상처럼 플레이어 발밑에 유지)
#   /execute as @p at @s run function mc/follow
# 끄기: /function mc/unfollow
tag @s add mc_caster
scoreboard players set @s mc_t 0
function mc/burst
