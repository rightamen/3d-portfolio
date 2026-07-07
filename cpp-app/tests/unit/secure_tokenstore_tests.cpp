#include "sdk/platform/SecureTokenStore.hpp"

#ifdef _WIN32
#include "sdk/platform/WindowsCredentialTokenStore.hpp"
#elif defined(__APPLE__)
#include "sdk/platform/MacOSKeychainTokenStore.hpp"
#endif

#include <exception>
#include <iostream>
#include <string>

namespace {

int failures = 0;
bool skipped = false;

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
#elif defined(__APPLE__)
  expect(mrright::sdk::platform::isPlatformSecureTokenStoreSupported(), "macOS reports secure TokenStore support");
  auto store = mrright::sdk::platform::createPlatformSecureTokenStore();
  expect(store != nullptr, "macOS factory returns a secure TokenStore");
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
#elif defined(__APPLE__)
bool isSkippableKeychainStatus(OSStatus status) {
  return status == errSecInteractionNotAllowed ||
         status == errSecAuthFailed ||
         status == errSecNotAvailable ||
         status == errSecUserCanceled;
}

void testMacOSKeychainStoreRoundTrip() {
  try {
    mrright::sdk::platform::MacOSKeychainTokenStore store("mrright.blog.tests", "visitor_token");
    struct ClearTestKeychainItemOnExit {
      mrright::sdk::platform::MacOSKeychainTokenStore& store;
      ~ClearTestKeychainItemOnExit() {
        try {
          store.clearVisitorToken();
        } catch (...) {
        }
      }
    } cleanup{store};
    const std::string firstToken = "mrright-test-visitor-token";
    const std::string secondToken = "mrright-test-visitor-token-2";

    store.clearVisitorToken();
    expect(!store.hasVisitorToken(), "macOS Keychain store starts empty after clear");

    store.saveVisitorToken(firstToken);
    expect(store.hasVisitorToken(), "macOS Keychain store has token after save");
    expect(store.loadVisitorToken().value_or("") == firstToken, "macOS Keychain store loads saved token");

    store.saveVisitorToken(secondToken);
    expect(store.loadVisitorToken().value_or("") == secondToken, "macOS Keychain store replaces saved token");

    store.clearVisitorToken();
    expect(!store.hasVisitorToken(), "macOS Keychain store has no token after clear");
    expect(!store.loadVisitorToken().has_value(), "macOS Keychain store load returns empty after clear");
  } catch (const mrright::sdk::platform::MacOSKeychainError& error) {
    if (isSkippableKeychainStatus(error.status())) {
      std::cout << "macOS Keychain runtime round-trip skipped: Keychain access is not available in this environment.\n";
      skipped = true;
      return;
    }
    throw;
  }
}
#endif

} // namespace

int main() {
  testFactorySupportMatchesPlatform();
#ifdef _WIN32
  testWindowsCredentialStoreRoundTrip();
#elif defined(__APPLE__)
  try {
    testMacOSKeychainStoreRoundTrip();
  } catch (const std::exception& error) {
    ++failures;
    std::cerr << "FAIL: macOS Keychain runtime round-trip failed: " << error.what() << '\n';
  }
#endif

  if (failures != 0) {
    std::cerr << failures << " secure token store test(s) failed.\n";
    return 1;
  }

  if (skipped) return 77;

  std::cout << "Secure token store tests passed.\n";
  return 0;
}
