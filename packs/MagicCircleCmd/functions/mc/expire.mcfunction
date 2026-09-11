# 자동 생성 파일 — 직접 수정하지 마세요.
# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.
# 기준점 수명 관리. mc_keep 태그(설치형)는 만료되지 않습니다.
# 지속 시간을 바꾸려면 200(틱 = 10초)을 고치세요.
scoreboard players add @s mc_life 1
execute if score @s mc_life matches 200.. unless entity @s[tag=mc_keep] run kill @s
