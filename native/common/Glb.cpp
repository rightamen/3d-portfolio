#include "Glb.hpp"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <draco/compression/decode.h>
#include <draco/core/decoder_buffer.h>
#include <fstream>
#include <functional>
#include <nlohmann/json.hpp>
#include <set>
#include <stdexcept>
namespace mr {
namespace {
using Json = nlohmann::json;
using Mat = std::array<float, 16>;
constexpr size_t maxVertices = 3000000, maxIndices = 18000000, maxTexture = 32 * 1024 * 1024;
[[noreturn]] void bad() {
  throw std::runtime_error("Unsupported or invalid GLB");
}
uint32_t u32(const unsigned char *p) {
  uint32_t v;
  std::memcpy(&v, p, 4);
  return v;
}
Mat identity() {
  return {1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1};
}
Mat multiply(const Mat &a, const Mat &b) {
  Mat r{};
  for (int c = 0; c < 4; c++)
    for (int row = 0; row < 4; row++)
      for (int k = 0; k < 4; k++)
        r[c * 4 + row] += a[k * 4 + row] * b[c * 4 + k];
  return r;
}
Mat transform(const Json &node) {
  Mat r = identity();
  if (node.contains("matrix")) {
    if (node["matrix"].size() != 16)
      bad();
    for (int i = 0; i < 16; i++)
      r[i] = node["matrix"][i].get<float>();
    return r;
  }
  auto t = node.value("translation", std::vector<float>{0, 0, 0}),
       s = node.value("scale", std::vector<float>{1, 1, 1}),
       q = node.value("rotation", std::vector<float>{0, 0, 0, 1});
  if (t.size() != 3 || s.size() != 3 || q.size() != 4)
    bad();
  float x = q[0], y = q[1], z = q[2], w = q[3];
  r = {s[0] * (1 - 2 * y * y - 2 * z * z),
       s[0] * (2 * x * y + 2 * w * z),
       s[0] * (2 * x * z - 2 * w * y),
       0,
       s[1] * (2 * x * y - 2 * w * z),
       s[1] * (1 - 2 * x * x - 2 * z * z),
       s[1] * (2 * y * z + 2 * w * x),
       0,
       s[2] * (2 * x * z + 2 * w * y),
       s[2] * (2 * y * z - 2 * w * x),
       s[2] * (1 - 2 * x * x - 2 * y * y),
       0,
       t[0],
       t[1],
       t[2],
       1};
  return r;
}
void normalize(Vertex &v) {
  float n = std::sqrt(v.nx * v.nx + v.ny * v.ny + v.nz * v.nz);
  if (n > 1e-9f) {
    v.nx /= n;
    v.ny /= n;
    v.nz /= n;
  }
}
void apply(Mesh &m, const Mat &t) {
  float a = t[0], b = t[4], c = t[8], d = t[1], e = t[5], f = t[9], g = t[2], h = t[6], i = t[10];
  float det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (std::abs(det) < 1e-12f)
    bad();
  for (auto &v : m.vertices) {
    auto x = v.x, y = v.y, z = v.z;
    v.x = t[0] * x + t[4] * y + t[8] * z + t[12];
    v.y = t[1] * x + t[5] * y + t[9] * z + t[13];
    v.z = t[2] * x + t[6] * y + t[10] * z + t[14];
    x = v.nx;
    y = v.ny;
    z = v.nz;
    v.nx = ((e * i - f * h) * x + (f * g - d * i) * y + (d * h - e * g) * z) / det;
    v.ny = ((c * h - b * i) * x + (a * i - c * g) * y + (b * g - a * h) * z) / det;
    v.nz = ((b * f - c * e) * x + (c * d - a * f) * y + (a * e - b * d) * z) / det;
    normalize(v);
    if (!std::isfinite(v.x) || !std::isfinite(v.y) || !std::isfinite(v.z) || std::abs(v.x) > 1e8 ||
        std::abs(v.y) > 1e8 || std::abs(v.z) > 1e8)
      bad();
  }
  if (det < 0)
    for (size_t j = 0; j < m.indices.size(); j += 3)
      std::swap(m.indices[j + 1], m.indices[j + 2]);
}
void normals(Mesh &m) {
  for (size_t j = 0; j + 2 < m.indices.size(); j += 3) {
    auto &a = m.vertices.at(m.indices[j]);
    auto &b = m.vertices.at(m.indices[j + 1]);
    auto &c = m.vertices.at(m.indices[j + 2]);
    float ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z, vx = c.x - a.x, vy = c.y - a.y,
          vz = c.z - a.z;
    float nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (auto k : {m.indices[j], m.indices[j + 1], m.indices[j + 2]}) {
      m.vertices[k].nx += nx;
      m.vertices[k].ny += ny;
      m.vertices[k].nz += nz;
    }
  }
  for (auto &v : m.vertices)
    normalize(v);
}
struct Binary {
  const unsigned char *data;
  size_t length;
};
Binary view(const Json &j, const std::vector<unsigned char> &bin, int id) {
  if (id < 0 || !j.contains("bufferViews") || size_t(id) >= j["bufferViews"].size())
    bad();
  auto &v = j["bufferViews"][id];
  if (v.value("buffer", 0) != 0)
    bad();
  size_t off = v.value("byteOffset", size_t(0)), n = v.at("byteLength").get<size_t>();
  if (off > bin.size() || n > bin.size() - off)
    bad();
  return {bin.data() + off, n};
}
struct Access {
  Binary bytes;
  size_t count, stride, width;
  int component;
  bool normalized;
};
Access access(const Json &j, const std::vector<unsigned char> &bin, int id, size_t dims) {
  if (id < 0 || !j.contains("accessors") || size_t(id) >= j["accessors"].size())
    bad();
  const auto &a = j["accessors"][id];
  if (a.contains("sparse"))
    bad();
  std::string type = a.at("type");
  if (type != (dims == 3 ? "VEC3" : dims == 2 ? "VEC2" : "SCALAR"))
    bad();
  size_t n = a.at("count");
  if (n > maxIndices)
    bad();
  int component = a.at("componentType");
  size_t width = component == 5126 || component == 5125   ? 4
                 : component == 5122 || component == 5123 ? 2
                 : component == 5120 || component == 5121 ? 1
                                                          : 0;
  if (!width)
    bad();
  int bid = a.at("bufferView");
  auto bytes = view(j, bin, bid);
  size_t off = a.value("byteOffset", size_t(0)),
         stride = j["bufferViews"][bid].value("byteStride", dims * width);
  if (stride < dims * width || stride > 252 || off > bytes.length ||
      (n && ((n - 1) > (bytes.length - off) / stride ||
             (n - 1) * stride + dims * width > bytes.length - off)))
    bad();
  return {{bytes.data + off, bytes.length - off},
          n,
          stride,
          width,
          component,
          a.value("normalized", false)};
}
float number(const Access &a, size_t index, size_t dim) {
  const unsigned char *p = a.bytes.data + index * a.stride + dim * a.width;
  float f = 0;
  switch (a.component) {
  case 5126:
    std::memcpy(&f, p, 4);
    break;
  case 5125:
    f = float(u32(p));
    break;
  case 5123: {
    uint16_t v;
    std::memcpy(&v, p, 2);
    f = a.normalized ? float(v) / 65535.f : float(v);
    break;
  }
  case 5122: {
    int16_t v;
    std::memcpy(&v, p, 2);
    f = a.normalized ? std::max(-1.f, float(v) / 32767.f) : float(v);
    break;
  }
  case 5121:
    f = a.normalized ? float(*p) / 255.f : float(*p);
    break;
  case 5120:
    f = a.normalized ? std::max(-1.f, float(int8_t(*p)) / 127.f) : float(int8_t(*p));
    break;
  default:
    bad();
  }
  if (!std::isfinite(f))
    bad();
  return f;
}
void material(const Json &j, const std::vector<unsigned char> &bin, const Json &p, Mesh &m) {
  int id = p.value("material", -1);
  if (id < 0)
    return;
  if (!j.contains("materials") || size_t(id) >= j["materials"].size())
    bad();
  const auto &mat = j["materials"][id];
  const auto &pbr = mat.value("pbrMetallicRoughness", Json::object());
  if (pbr.contains("baseColorFactor")) {
    auto a = pbr["baseColorFactor"];
    if (a.size() != 4)
      bad();
    for (int k = 0; k < 4; k++) {
      float v = a[k];
      m.color[k] = std::isfinite(v) ? std::clamp(v, 0.f, 1.f) : 1.f;
    }
  }
  if (!pbr.contains("baseColorTexture"))
    return;
  int tid = pbr["baseColorTexture"].value("index", -1);
  if (tid < 0 || !j.contains("textures") || size_t(tid) >= j["textures"].size())
    bad();
  const auto &t = j["textures"][tid];
  int image = t.value("source", -1);
  if (t.contains("extensions") && t["extensions"].contains("EXT_texture_webp"))
    image = t["extensions"]["EXT_texture_webp"].value("source", -1);
  if (image < 0 || !j.contains("images") || size_t(image) >= j["images"].size())
    bad();
  const auto &img = j["images"][image];
  if (!img.contains("bufferView"))
    return;
  auto bytes = view(j, bin, img["bufferView"]);
  if (bytes.length > maxTexture)
    bad();
  m.texture.assign(bytes.data, bytes.data + bytes.length);
}
template <class T> void write(std::ostream &o, const T &v) {
  o.write(reinterpret_cast<const char *>(&v), sizeof(v));
}
template <class T> T read(std::istream &i) {
  T v{};
  i.read(reinterpret_cast<char *>(&v), sizeof(v));
  if (!i)
    bad();
  return v;
}
} // namespace
Model decodeGlb(const std::vector<unsigned char> &bytes) {
  if (bytes.size() < 20 || bytes.size() > 128 * 1024 * 1024 || u32(bytes.data()) != 0x46546c67 ||
      u32(bytes.data() + 4) != 2 || u32(bytes.data() + 8) != bytes.size())
    bad();
  Json j;
  std::vector<unsigned char> bin;
  size_t offset = 12;
  while (offset + 8 <= bytes.size()) {
    size_t n = u32(bytes.data() + offset);
    uint32_t type = u32(bytes.data() + offset + 4);
    offset += 8;
    if (n > bytes.size() - offset)
      bad();
    if (type == 0x4e4f534a) {
      if (!j.is_null() || n > 8 * 1024 * 1024)
        bad();
      j = Json::parse(bytes.begin() + offset, bytes.begin() + offset + n);
    } else if (type == 0x004e4942) {
      if (!bin.empty())
        bad();
      bin.assign(bytes.begin() + offset, bytes.begin() + offset + n);
    }
    offset += n;
  }
  if (offset != bytes.size() || j.is_null() || bin.empty() || !j.contains("meshes"))
    bad();
  Model model;
  std::vector<std::vector<Mesh>> library;
  size_t total = 0;
  for (const auto &mesh : j["meshes"]) {
    std::vector<Mesh> primitives;
    for (const auto &p : mesh.at("primitives")) {
      if (p.value("mode", 4) != 4)
        continue;
      Mesh out;
      bool hasNormals = false;
      if (p.contains("extensions") && p["extensions"].contains("KHR_draco_mesh_compression")) {
        const auto &ex = p["extensions"]["KHR_draco_mesh_compression"];
        auto data = view(j, bin, ex.at("bufferView"));
        draco::DecoderBuffer buffer;
        buffer.Init(reinterpret_cast<const char *>(data.data), data.length);
        draco::Decoder decoder;
        auto result = decoder.DecodeMeshFromBuffer(&buffer);
        if (!result.ok())
          bad();
        auto decoded = std::move(result).value();
        if (!decoded || decoded->num_points() > maxVertices ||
            size_t(decoded->num_faces()) * 3 > maxIndices)
          bad();
        out.vertices.resize(decoded->num_points());
        auto attribute = [&](const char *name) -> const draco::PointAttribute * {
          auto it = ex.at("attributes").find(name);
          return it == ex.at("attributes").end()
                     ? nullptr
                     : decoded->GetAttributeByUniqueId(it->get<uint32_t>());
        };
        const auto *position = attribute("POSITION");
        const auto *normal = attribute("NORMAL");
        const auto *uv = attribute("TEXCOORD_0");
        if (!position)
          bad();
        hasNormals = normal != nullptr;
        for (uint32_t v = 0; v < decoded->num_points(); v++) {
          draco::PointIndex pi(v);
          float a[3];
          if (!position->ConvertValue<float>(position->mapped_index(pi), 3, a))
            bad();
          auto &vert = out.vertices[v];
          vert.x = a[0];
          vert.y = a[1];
          vert.z = a[2];
          if (normal) {
            if (!normal->ConvertValue<float>(normal->mapped_index(pi), 3, a))
              bad();
            vert.nx = a[0];
            vert.ny = a[1];
            vert.nz = a[2];
          }
          if (uv) {
            float b[2];
            if (!uv->ConvertValue<float>(uv->mapped_index(pi), 2, b))
              bad();
            vert.u = b[0];
            vert.v = b[1];
          }
        }
        out.indices.reserve(size_t(decoded->num_faces()) * 3);
        for (draco::FaceIndex fi(0); fi < decoded->num_faces(); ++fi) {
          auto face = decoded->face(fi);
          for (auto index : face)
            out.indices.push_back(index.value());
        }
        model.draco = true;
      } else {
        const auto &attrs = p.at("attributes");
        auto pos = access(j, bin, attrs.at("POSITION"), 3);
        if (pos.count > maxVertices)
          bad();
        out.vertices.resize(pos.count);
        for (size_t v = 0; v < pos.count; v++) {
          out.vertices[v].x = number(pos, v, 0);
          out.vertices[v].y = number(pos, v, 1);
          out.vertices[v].z = number(pos, v, 2);
        }
        if (attrs.contains("NORMAL")) {
          auto n = access(j, bin, attrs["NORMAL"], 3);
          if (n.count != pos.count)
            bad();
          for (size_t v = 0; v < pos.count; v++) {
            out.vertices[v].nx = number(n, v, 0);
            out.vertices[v].ny = number(n, v, 1);
            out.vertices[v].nz = number(n, v, 2);
          }
          hasNormals = true;
        }
        if (attrs.contains("TEXCOORD_0")) {
          auto uv = access(j, bin, attrs["TEXCOORD_0"], 2);
          if (uv.count != pos.count)
            bad();
          for (size_t v = 0; v < pos.count; v++) {
            out.vertices[v].u = number(uv, v, 0);
            out.vertices[v].v = number(uv, v, 1);
          }
        }
        if (p.contains("indices")) {
          auto idx = access(j, bin, p["indices"], 1);
          if (idx.component != 5121 && idx.component != 5123 && idx.component != 5125)
            bad();
          out.indices.reserve(idx.count);
          for (size_t v = 0; v < idx.count; v++) {
            auto *at = idx.bytes.data + idx.stride * v;
            uint32_t index = idx.component == 5121   ? *at
                             : idx.component == 5123 ? uint32_t(at[0] | (at[1] << 8))
                                                     : u32(at);
            if (index >= out.vertices.size())
              bad();
            out.indices.push_back(index);
          }
        } else
          for (uint32_t v = 0; v < out.vertices.size(); v++)
            out.indices.push_back(v);
      }
      if (out.indices.empty() || out.indices.size() % 3)
        bad();
      for (auto i : out.indices)
        if (i >= out.vertices.size())
          bad();
      if (!hasNormals)
        normals(out);
      material(j, bin, p, out);
      total += out.vertices.size();
      if (total > maxVertices)
        bad();
      primitives.push_back(std::move(out));
    }
    library.push_back(std::move(primitives));
  }
  total = 0;
  auto append = [&](size_t mesh, const Mat &t) {
    if (mesh >= library.size())
      bad();
    for (const auto &m : library[mesh]) {
      total += m.vertices.size();
      if (total > maxVertices)
        bad();
      Mesh copy = m;
      apply(copy, t);
      model.triangles += copy.indices.size() / 3;
      model.meshes.push_back(std::move(copy));
    }
  };
  std::set<int> path;
  std::function<void(int, const Mat &, int)> walk = [&](int n, const Mat &parent, int depth) {
    if (depth > 64 || n < 0 || !j.contains("nodes") || size_t(n) >= j["nodes"].size() ||
        path.contains(n))
      bad();
    path.insert(n);
    const auto &node = j["nodes"][n];
    auto t = multiply(parent, transform(node));
    if (node.contains("mesh"))
      append(node["mesh"], t);
    if (node.contains("children"))
      for (auto child : node["children"])
        walk(child, t, depth + 1);
    path.erase(n);
  };
  if (j.contains("scenes") && !j["scenes"].empty()) {
    int scene = j.value("scene", 0);
    if (scene < 0 || size_t(scene) >= j["scenes"].size())
      bad();
    for (auto node : j["scenes"][scene].value("nodes", Json::array()))
      walk(node, identity(), 0);
  } else if (j.contains("nodes")) {
    std::set<int> children;
    for (auto &node : j["nodes"])
      for (auto c : node.value("children", Json::array()))
        children.insert(c.get<int>());
    for (size_t n = 0; n < j["nodes"].size(); n++)
      if (!children.contains(int(n)))
        walk(int(n), identity(), 0);
  } else
    for (size_t n = 0; n < library.size(); n++)
      append(n, identity());
  if (model.meshes.empty())
    bad();
  std::array<float, 3> lo = {1e30f, 1e30f, 1e30f}, hi = {-1e30f, -1e30f, -1e30f};
  for (const auto &m : model.meshes)
    for (const auto &v : m.vertices) {
      const float a[] = {v.x, v.y, v.z};
      for (int k = 0; k < 3; k++) {
        lo[k] = std::min(lo[k], a[k]);
        hi[k] = std::max(hi[k], a[k]);
      }
    }
  float sum = 0;
  for (int k = 0; k < 3; k++) {
    model.center[k] = (lo[k] + hi[k]) * .5f;
    float d = hi[k] - lo[k];
    sum += d * d;
  }
  model.radius = std::max(.001f, std::sqrt(sum) * .5f);
  return model;
}
void saveModel(const Model &m, const std::filesystem::path &path) {
  std::ofstream out(path, std::ios::binary | std::ios::trunc);
  if (!out)
    bad();
  write(out, uint32_t(0x314d524d));
  write(out, uint32_t(m.meshes.size()));
  for (float f : m.center)
    write(out, f);
  write(out, m.radius);
  write(out, uint32_t(m.draco));
  for (const auto &mesh : m.meshes) {
    write(out, uint32_t(mesh.vertices.size()));
    write(out, uint32_t(mesh.indices.size()));
    write(out, uint32_t(mesh.texture.size()));
    for (float c : mesh.color)
      write(out, c);
    out.write(reinterpret_cast<const char *>(mesh.vertices.data()),
              mesh.vertices.size() * sizeof(Vertex));
    out.write(reinterpret_cast<const char *>(mesh.indices.data()), mesh.indices.size() * 4);
    out.write(reinterpret_cast<const char *>(mesh.texture.data()), mesh.texture.size());
  }
  if (!out)
    bad();
}
Model loadModel(const std::filesystem::path &path) {
  std::ifstream in(path, std::ios::binary);
  if (!in || read<uint32_t>(in) != 0x314d524d)
    bad();
  uint32_t count = read<uint32_t>(in);
  if (count > 10000)
    bad();
  Model m;
  for (auto &f : m.center)
    f = read<float>(in);
  m.radius = read<float>(in);
  m.draco = read<uint32_t>(in) != 0;
  size_t total = 0;
  if (!std::isfinite(m.radius) || m.radius <= 0)
    bad();
  for (uint32_t k = 0; k < count; k++) {
    Mesh mesh;
    size_t nv = read<uint32_t>(in), ni = read<uint32_t>(in), nt = read<uint32_t>(in);
    total += nv;
    if (total > maxVertices || ni > maxIndices || nt > maxTexture || ni % 3)
      bad();
    for (auto &c : mesh.color)
      c = read<float>(in);
    mesh.vertices.resize(nv);
    mesh.indices.resize(ni);
    mesh.texture.resize(nt);
    in.read(reinterpret_cast<char *>(mesh.vertices.data()), nv * sizeof(Vertex));
    in.read(reinterpret_cast<char *>(mesh.indices.data()), ni * 4);
    in.read(reinterpret_cast<char *>(mesh.texture.data()), nt);
    if (!in)
      bad();
    for (auto index : mesh.indices)
      if (index >= nv)
        bad();
    m.triangles += ni / 3;
    m.meshes.push_back(std::move(mesh));
  }
  if (m.meshes.empty())
    bad();
  return m;
}
} // namespace mr
