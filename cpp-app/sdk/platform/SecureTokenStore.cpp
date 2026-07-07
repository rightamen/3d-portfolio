#include "sdk/platform/SecureTokenStore.hpp"

#ifdef _WIN32
#include "sdk/platform/WindowsCredentialTokenStore.hpp"
#elif defined(__APPLE__)
#include "sdk/platform/MacOSKeychainTokenStore.hpp"
#endif

namespace mrright::sdk::platform {

std::unique_ptr<core::TokenStore> createPlatformSecureTokenStore() {
#ifdef _WIN32
  return std::make_unique<WindowsCredentialTokenStore>();
#elif defined(__APPLE__)
  return std::make_unique<MacOSKeychainTokenStore>();
#else
  return nullptr;
#endif
}

bool isPlatformSecureTokenStoreSupported() {
#ifdef _WIN32
  return true;
#elif defined(__APPLE__)
  return true;
#else
  return false;
#endif
}

} // namespace mrright::sdk::platform
