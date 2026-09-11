# 자동 생성 파일 — 직접 수정하지 마세요.
# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.
# 마법진 1개당 매 틱 실행: 프레임 카운터를 돌리고 해당 프레임을 그림
# (프레임 16개 × 2틱 = 32틱 주기)
scoreboard players add @s mc_t 1
execute if score @s mc_t matches 32.. run scoreboard players set @s mc_t 0
execute if score @s mc_t matches 0 run function mc/frames/f00
execute if score @s mc_t matches 2 run function mc/frames/f01
execute if score @s mc_t matches 4 run function mc/frames/f02
execute if score @s mc_t matches 6 run function mc/frames/f03
execute if score @s mc_t matches 8 run function mc/frames/f04
execute if score @s mc_t matches 10 run function mc/frames/f05
execute if score @s mc_t matches 12 run function mc/frames/f06
execute if score @s mc_t matches 14 run function mc/frames/f07
execute if score @s mc_t matches 16 run function mc/frames/f08
execute if score @s mc_t matches 18 run function mc/frames/f09
execute if score @s mc_t matches 20 run function mc/frames/f10
execute if score @s mc_t matches 22 run function mc/frames/f11
execute if score @s mc_t matches 24 run function mc/frames/f12
execute if score @s mc_t matches 26 run function mc/frames/f13
execute if score @s mc_t matches 28 run function mc/frames/f14
execute if score @s mc_t matches 30 run function mc/frames/f15
