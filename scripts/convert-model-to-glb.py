import argparse
import sys
from pathlib import Path

import bpy


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def import_model(input_path):
    extension = input_path.suffix.lower()
    if extension == ".fbx":
        bpy.ops.import_scene.fbx(filepath=str(input_path))
        return

    if extension == ".obj":
        if hasattr(bpy.ops.wm, "obj_import"):
            bpy.ops.wm.obj_import(filepath=str(input_path))
        else:
            bpy.ops.import_scene.obj(filepath=str(input_path))
        return

    raise ValueError(f"Unsupported model format: {extension}")


def normalize_scene():
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise ValueError("No mesh objects were found in the uploaded model.")

    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--out", required=True)
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    args = parser.parse_args(argv)

    input_path = Path(args.input)
    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    import_model(input_path)
    normalize_scene()

    bpy.ops.export_scene.gltf(
        filepath=str(output_path),
        export_format="GLB",
        export_apply=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
        export_draco_mesh_compression_enable=True,
        export_draco_mesh_compression_level=6,
    )


if __name__ == "__main__":
    main()
