import argparse
import sys
from pathlib import Path

import bpy


def clear_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()


def image_node(nodes, path, colorspace="sRGB"):
    node = nodes.new("ShaderNodeTexImage")
    node.image = bpy.data.images.load(str(path))
    node.image.colorspace_settings.name = colorspace
    return node


def build_material(texture_dir):
    material = bpy.data.materials.new("TL_meihuoqi_PBR")
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    principled = nodes.get("Principled BSDF")

    base = texture_dir / "TL_meihuoqi_low_low_uv_BaseColor.png"
    normal = texture_dir / "TL_meihuoqi_low_low_uv_Normal.png"
    metallic = texture_dir / "TL_meihuoqi_low_low_uv_Metallic.png"
    roughness = texture_dir / "TL_meihuoqi_low_low_uv_Roughness.png"

    if base.exists():
        base_node = image_node(nodes, base, "sRGB")
        links.new(base_node.outputs["Color"], principled.inputs["Base Color"])

    if metallic.exists():
        metallic_node = image_node(nodes, metallic, "Non-Color")
        links.new(metallic_node.outputs["Color"], principled.inputs["Metallic"])

    if roughness.exists():
        roughness_node = image_node(nodes, roughness, "Non-Color")
        links.new(roughness_node.outputs["Color"], principled.inputs["Roughness"])

    if normal.exists():
        normal_texture = image_node(nodes, normal, "Non-Color")
        normal_map = nodes.new("ShaderNodeNormalMap")
        normal_map.inputs["Strength"].default_value = 1
        links.new(normal_texture.outputs["Color"], normal_map.inputs["Color"])
        links.new(normal_map.outputs["Normal"], principled.inputs["Normal"])

    return material


def normalize_scene():
    bpy.ops.object.select_all(action="DESELECT")
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    for obj in meshes:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0] if meshes else None
    if meshes:
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--fbx", required=True)
    parser.add_argument("--textures", required=True)
    parser.add_argument("--out", required=True)
    argv = sys.argv
    if "--" in argv:
        argv = argv[argv.index("--") + 1 :]
    else:
        argv = []
    args = parser.parse_args(argv)

    fbx_path = Path(args.fbx)
    texture_dir = Path(args.textures)
    output_path = Path(args.out)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    clear_scene()
    bpy.ops.import_scene.fbx(filepath=str(fbx_path))

    material = build_material(texture_dir)
    for obj in bpy.context.scene.objects:
        if obj.type == "MESH":
            obj.data.materials.clear()
            obj.data.materials.append(material)

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
