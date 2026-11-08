#pragma once
#include <array>
#include <cstdint>
#include <filesystem>
#include <vector>
namespace mr {
struct Vertex {
  float x = 0, y = 0, z = 0, nx = 0, ny = 0, nz = 0, u = 0, v = 0;
};
struct Mesh {
  std::vector<Vertex> vertices;
  std::vector<uint32_t> indices;
  std::array<float, 4> color = {.72f, .78f, .8f, 1};
  std::vector<unsigned char> texture;
};
struct Model {
  std::vector<Mesh> meshes;
  std::array<float, 3> center{};
  float radius = 1;
  size_t triangles = 0;
  bool draco = false;
};
Model decodeGlb(const std::vector<unsigned char> &);
void saveModel(const Model &, const std::filesystem::path &);
Model loadModel(const std::filesystem::path &);
} // namespace mr
