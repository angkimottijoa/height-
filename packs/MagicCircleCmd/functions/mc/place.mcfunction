# 자동 생성 파일 — 직접 수정하지 마세요.
# tools/gen_magic_circle_commands.py 를 고치고 다시 실행하세요.
# 마법진 설치 (/function mc/stop 으로 지울 때까지 유지)
summon armor_stand ~ ~ ~
tag @e[type=armor_stand,r=0.5,c=1] add mc_on
scoreboard players set @e[type=armor_stand,tag=mc_on,r=0.5,c=1] mc_t 0
scoreboard players set @e[type=armor_stand,tag=mc_on,r=0.5,c=1] mc_life 0
effect @e[type=armor_stand,tag=mc_on,r=0.5,c=1] invisibility 1000000 1 true
tag @e[type=armor_stand,tag=mc_on,r=0.5,c=1] add mc_keep
function mc/burst
