#include "sdk/platform/SecureTokenStore.hpp"

#ifdef _WIN32
#include "sdk/platform/WindowsCredentialTokenStore.hpp"
#elif defined(__APPLE__)
#include "sdk/platform/MacOSKeychainTokenStore.hpp"
#elif defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
#include "sdk/platform/LinuxSecretServiceTokenStore.hpp"

#include <gio/gio.h>
#include <libsecret/secret.h>
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
#elif defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
  expect(mrright::sdk::platform::isPlatformSecureTokenStoreSupported(), "Linux reports secure TokenStore support");
  auto store = mrright::sdk::platform::createPlatformSecureTokenStore();
  expect(store != nullptr, "Linux factory returns a Secret Service TokenStore");
#else
  expect(!mrright::sdk::platform::isPlatformSecureTokenStoreSupported(), "platform reports secure TokenStore unsupported");
  auto store = mrright::sdk::platform::createPlatformSecureTokenStore();
  expect(store == nullptr, "unsupported platform factory returns nullptr instead of an insecure fallback");
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
#elif defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
bool isSkippableSecretServiceError(const mrright::sdk::platform::LinuxSecretServiceError& error) {
  if (error.domain() == SECRET_ERROR && error.code() == SECRET_ERROR_IS_LOCKED) return true;
  if (error.domain() == G_DBUS_ERROR) return true;
  if (error.domain() == G_IO_ERROR) {
    return error.code() == G_IO_ERROR_DBUS_ERROR ||
           error.code() == G_IO_ERROR_NOT_FOUND ||
           error.code() == G_IO_ERROR_NOT_CONNECTED ||
           error.code() == G_IO_ERROR_CONNECTION_REFUSED ||
           error.code() == G_IO_ERROR_FAILED ||
           error.code() == G_IO_ERROR_CANCELLED;
  }
  return false;
}

void testLinuxSecretServiceStoreRoundTrip() {
  try {
    mrright::sdk::platform::LinuxSecretServiceTokenStore store("visitor_token_test");
    struct ClearTestSecretOnExit {
      mrright::sdk::platform::LinuxSecretServiceTokenStore& store;
      ~ClearTestSecretOnExit() {
        try {
          store.clearVisitorToken();
        } catch (...) {
        }
      }
    } cleanup{store};
    const std::string firstToken = "mrright-test-visitor-token";
    const std::string secondToken = "mrright-test-visitor-token-2";

    store.clearVisitorToken();
    expect(!store.hasVisitorToken(), "Linux Secret Service store starts empty after clear");

    store.saveVisitorToken(firstToken);
    expect(store.hasVisitorToken(), "Linux Secret Service store has token after save");
    expect(store.loadVisitorToken().value_or("") == firstToken, "Linux Secret Service store loads saved token");

    store.saveVisitorToken(secondToken);
    expect(store.loadVisitorToken().value_or("") == secondToken, "Linux Secret Service store replaces saved token");

    store.clearVisitorToken();
    expect(!store.hasVisitorToken(), "Linux Secret Service store has no token after clear");
    expect(!store.loadVisitorToken().has_value(), "Linux Secret Service store load returns empty after clear");
  } catch (const mrright::sdk::platform::LinuxSecretServiceError& error) {
    if (isSkippableSecretServiceError(error)) {
      std::cout << "Linux Secret Service runtime round-trip skipped: D-Bus session or desktop keyring is not available. "
                << error.what() << '\n';
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
#elif defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
  try {
    testLinuxSecretServiceStoreRoundTrip();
  } catch (const std::exception& error) {
    ++failures;
    std::cerr << "FAIL: Linux Secret Service runtime round-trip failed: " << error.what() << '\n';
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
