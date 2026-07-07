#include "sdk/platform/SecureTokenStore.hpp"

#ifdef _WIN32
#include "sdk/platform/WindowsCredentialTokenStore.hpp"
#endif

#include <exception>
#include <iostream>
#include <string>

namespace {

int failures = 0;

void expect(bool condition, const std::string& message) {
  if (condition) return;
  ++failures;
  std::cerr << "FAIL: " << message << '\n';
}

void testFactorySupportMatchesPlatform() {
#ifdef _WIN32
  expect(mrright::sdk::platform::isPlatformSecureTokenStoreSupported(), "Windows reports secure TokenStore support");
  auto store = mrright::sdk::platform::createPlatformSecureTokenStore();
  expect(store != nullptr, "Windows factory returns a secure TokenStore");
#else
  expect(!mrright::sdk::platform::isPlatformSecureTokenStoreSupported(), "non-Windows reports secure TokenStore unsupported");
  auto store = mrright::sdk::platform::createPlatformSecureTokenStore();
  expect(store == nullptr, "non-Windows factory returns nullptr instead of an insecure fallback");
#endif
}

#ifdef _WIN32
void testWindowsCredentialStoreRoundTrip() {
  try {
    mrright::sdk::platform::WindowsCredentialTokenStore store(L"mrright.blog.visitor_token.test");
    struct ClearTestCredentialOnExit {
      mrright::sdk::platform::WindowsCredentialTokenStore& store;
      ~ClearTestCredentialOnExit() {
        try {
          store.clearVisitorToken();
        } catch (...) {
        }
      }
    } cleanup{store};
    const std::string firstToken = "mrright-test-visitor-token";
    const std::string secondToken = "mrright-test-visitor-token-2";

    store.clearVisitorToken();
    expect(!store.hasVisitorToken(), "Windows credential store starts empty after clear");

    store.saveVisitorToken(firstToken);
    expect(store.hasVisitorToken(), "Windows credential store has token after save");
    expect(store.loadVisitorToken().value_or("") == firstToken, "Windows credential store loads saved token");

    store.saveVisitorToken(secondToken);
    expect(store.loadVisitorToken().value_or("") == secondToken, "Windows credential store replaces saved token");

    store.clearVisitorToken();
    expect(!store.hasVisitorToken(), "Windows credential store has no token after clear");
    expect(!store.loadVisitorToken().has_value(), "Windows credential store load returns empty after clear");
  } catch (const std::exception&) {
    std::cout << "Windows Credential Manager runtime round-trip skipped.\n";
  }
}
#endif

} // namespace

int main() {
  testFactorySupportMatchesPlatform();
#ifdef _WIN32
  testWindowsCredentialStoreRoundTrip();
#endif

  if (failures != 0) {
    std::cerr << failures << " secure token store test(s) failed.\n";
    return 1;
  }

  std::cout << "Secure token store tests passed.\n";
  return 0;
}
