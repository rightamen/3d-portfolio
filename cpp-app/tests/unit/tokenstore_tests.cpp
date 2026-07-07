#include "sdk/core/MemoryTokenStore.hpp"
#include "sdk/core/TokenStore.hpp"

#include <filesystem>
#include <iostream>
#include <string>

namespace {

using mrright::sdk::core::MemoryTokenStore;
using mrright::sdk::core::TokenStore;

int failures = 0;

void expect(bool condition, const std::string& message) {
  if (condition) return;
  ++failures;
  std::cerr << "FAIL: " << message << '\n';
}

void testInitialStoreIsEmpty() {
  MemoryTokenStore store;

  expect(!store.hasVisitorToken(), "MemoryTokenStore starts without a token");
  expect(!store.loadVisitorToken().has_value(), "MemoryTokenStore load returns empty initially");
}

void testSaveThenLoad() {
  MemoryTokenStore store;
  TokenStore& interface = store;

  interface.saveVisitorToken("test-session-token");

  expect(store.hasVisitorToken(), "MemoryTokenStore has token after save");
  expect(interface.loadVisitorToken().value_or("") == "test-session-token", "MemoryTokenStore loads saved token");
}

void testClearRemovesToken() {
  MemoryTokenStore store;
  store.saveVisitorToken("test-session-token");

  store.clearVisitorToken();

  expect(!store.hasVisitorToken(), "MemoryTokenStore has no token after clear");
  expect(!store.loadVisitorToken().has_value(), "MemoryTokenStore load returns empty after clear");
}

void testOverwriteReplacesToken() {
  MemoryTokenStore store;

  store.saveVisitorToken("first-test-token");
  store.saveVisitorToken("second-test-token");

  expect(store.hasVisitorToken(), "MemoryTokenStore has token after overwrite");
  expect(store.loadVisitorToken().value_or("") == "second-test-token", "MemoryTokenStore replaces old token on save");
}

void testDoesNotCreateFiles() {
  const auto before = std::filesystem::current_path();

  MemoryTokenStore store;
  store.saveVisitorToken("test-session-token");
  store.clearVisitorToken();

  expect(std::filesystem::current_path() == before, "MemoryTokenStore does not change current directory");
  expect(!std::filesystem::exists("test-session-token"), "MemoryTokenStore does not create a token-named file");
  expect(!std::filesystem::exists("visitor-token"), "MemoryTokenStore does not create a visitor-token file");
  expect(!std::filesystem::exists("token.json"), "MemoryTokenStore does not create token.json");
}

} // namespace

int main() {
  testInitialStoreIsEmpty();
  testSaveThenLoad();
  testClearRemovesToken();
  testOverwriteReplacesToken();
  testDoesNotCreateFiles();

  if (failures != 0) {
    std::cerr << failures << " token store test(s) failed.\n";
    return 1;
  }

  std::cout << "Token store tests passed.\n";
  return 0;
}
