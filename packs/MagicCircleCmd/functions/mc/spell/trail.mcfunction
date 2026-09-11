# 자동 생성 파일 — 직접 수정하지 마세요.
# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.
# 날아가는 눈덩이마다 매 틱 실행 (나선 궤적 + 주기적 충격파 링)
scoreboard players add @s mc_t 1
execute if score @s mc_t matches 1 run function mc/spell/t0
execute if score @s mc_t matches 2 run function mc/spell/t1
execute if score @s mc_t matches 3 run function mc/spell/t2
execute if score @s mc_t matches 4 run function mc/spell/t3
execute if score @s mc_t matches 4.. run particle minecraft:knockback_roar_particle ~ ~ ~
execute if score @s mc_t matches 4.. run scoreboard players set @s mc_t 0
