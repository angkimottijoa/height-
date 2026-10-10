"""The independent iron door.

Vanilla iron doors are drawn with alpha testing, which loses the texture's
thin opaque pixels in the distant mip levels, so the door disappears far
away. This door draws the same model and textures with
`alpha_test_to_opaque`: alpha tested up close, opaque from half the render
distance on, so it never vanishes.

It keeps the vanilla behaviour: two blocks tall, placed facing the player,
opened only by redstone (either half powered opens both), sounds included.
"""
from .catalog import Spec

FACINGS = ['north', 'east', 'south', 'west']


def iron_door_spec(geyser):
    def jo(a):
        return [('iron_door', {
            'facing': a['minecraft:cardinal_direction'],
            'half': 'upper' if a['minecraft:multi_block_part'] else 'lower',
            'hinge': 'right' if a['vyt:hinge'] else 'left',
            'open': 'true' if a['vyt:open'] else 'false',
            'powered': 'false',
        })]

    spec = Spec('ds_iron_door', 'iron_door', 'door',
                [('vyt:open', [0, 1]), ('vyt:hinge', [0, 1]), ('vyt:powered', [0, 1])], jo,
                multi_block=True, collision='model', render='alpha_test_to_opaque')
    spec.extra_states = [('minecraft:cardinal_direction', ['south', 'west', 'north', 'east']),
                         ('minecraft:multi_block_part', [0, 1])]
    spec.labels = {'vyt:open': {0: 'closed', 1: 'open'}, 'vyt:hinge': {0: 'left', 1: 'right'},
                   'vyt:powered': {0: 'off', 1: 'on'}}
    spec.java_name = 'iron_door'
    spec.door = True
    spec.components = {
        'minecraft:redstone_consumer': {'min_power': 0},
        'vyt:iron_door': {},
    }
    return spec
