#include "sdk/platform/SecureTokenStore.hpp"

#ifdef _WIN32
#include "sdk/platform/WindowsCredentialTokenStore.hpp"
#endif

namespace mrright::sdk::platform {

std::unique_ptr<core::TokenStore> createPlatformSecureTokenStore() {
#ifdef _WIN32
  return std::make_unique<WindowsCredentialTokenStore>();
#else
  return nullptr;
#endif
}

bool isPlatformSecureTokenStoreSupported() {
#ifdef _WIN32
  return true;
#else
  return false;
#endif
}

} // namespace mrright::sdk::platform
