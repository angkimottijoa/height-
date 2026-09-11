# 자동 생성 파일 — 직접 수정하지 마세요.
# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.
# tick.json 진입점: 기준점 마법진 · 따라다니는 마법진 · 눈덩이 궤적
execute as @e[type=armor_stand,tag=mc_on] at @s run function mc/drive
execute as @e[type=armor_stand,tag=mc_on] at @s run function mc/expire
execute as @a[tag=mc_caster] at @s run function mc/drive
execute as @e[type=snowball] at @s run function mc/spell/trail
