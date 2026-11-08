#include "../common/Glb.hpp"
#include <cassert>
#include <fstream>
#include <iostream>
int main(int argc, char **argv) {
  int failures = 0;
  for (int i = 1; i < argc; i++) {
    try {
      std::ifstream in(argv[i], std::ios::binary);
      std::vector<unsigned char> b((std::istreambuf_iterator<char>(in)), {});
      auto m = mr::decodeGlb(b);
      assert(m.triangles > 0);
      std::cout << argv[i] << " meshes=" << m.meshes.size() << " triangles=" << m.triangles
                << " draco=" << m.draco << "\n";
    } catch (const std::exception &e) {
      std::cerr << "Model decode failed: " << e.what() << "\n";
      failures++;
    }
  }
  for (size_t n : {0, 5, 19}) {
    try {
      mr::decodeGlb(std::vector<unsigned char>(n));
      failures++;
    } catch (...) {
    }
  }
  return failures ? 1 : 0;
}
