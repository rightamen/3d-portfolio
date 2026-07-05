import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    return parser.parse_args(argv)


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def scene_bounds(objects):
    mins = Vector((math.inf, math.inf, math.inf))
    maxs = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            world = obj.matrix_world @ Vector(corner)
            mins.x = min(mins.x, world.x)
            mins.y = min(mins.y, world.y)
            mins.z = min(mins.z, world.z)
            maxs.x = max(maxs.x, world.x)
            maxs.y = max(maxs.y, world.y)
            maxs.z = max(maxs.z, world.z)
    return mins, maxs


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def main():
    args = parse_args()
    output = Path(args.out)
    output.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    bpy.ops.import_scene.gltf(filepath=args.glb)

    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    mins, maxs = scene_bounds(meshes)
    center = (mins + maxs) / 2
    size = max(maxs.x - mins.x, maxs.y - mins.y, maxs.z - mins.z)

    bpy.ops.object.light_add(type="AREA", location=(2.5, -3.5, 4))
    key = bpy.context.object
    key.name = "Key softbox"
    key.data.energy = 550
    key.data.size = 4

    bpy.ops.object.camera_add(location=(center.x + size * 1.45, center.y - size * 2.2, center.z + size * 0.9))
    camera = bpy.context.object
    look_at(camera, center)
    camera.data.lens = 55
    bpy.context.scene.camera = camera

    bpy.context.scene.render.engine = "BLENDER_EEVEE_NEXT"
    bpy.context.scene.eevee.taa_render_samples = 64
    bpy.context.scene.world.color = (0.03, 0.04, 0.08)
    bpy.context.scene.render.resolution_x = 1400
    bpy.context.scene.render.resolution_y = 1000
    bpy.context.scene.render.film_transparent = False
    bpy.context.scene.view_settings.view_transform = "Filmic"
    bpy.context.scene.view_settings.look = "Medium High Contrast"
    bpy.context.scene.render.image_settings.file_format = "PNG"
    bpy.context.scene.render.filepath = str(output)

    bpy.ops.render.render(write_still=True)


if __name__ == "__main__":
    main()
