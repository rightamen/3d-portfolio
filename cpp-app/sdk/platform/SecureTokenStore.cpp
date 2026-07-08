#include "sdk/platform/SecureTokenStore.hpp"

#ifdef _WIN32
#include "sdk/platform/WindowsCredentialTokenStore.hpp"
#elif defined(__APPLE__)
#include "sdk/platform/MacOSKeychainTokenStore.hpp"
#elif defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
#include "sdk/platform/LinuxSecretServiceTokenStore.hpp"
#endif

namespace mrright::sdk::platform {

std::unique_ptr<core::TokenStore> createPlatformSecureTokenStore() {
#ifdef _WIN32
  return std::make_unique<WindowsCredentialTokenStore>();
#elif defined(__APPLE__)
  return std::make_unique<MacOSKeychainTokenStore>();
#elif defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
  return std::make_unique<LinuxSecretServiceTokenStore>();
#else
  return nullptr;
#endif
}

bool isPlatformSecureTokenStoreSupported() {
#ifdef _WIN32
  return true;
#elif defined(__APPLE__)
  return true;
#elif defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
  return true;
#else
  return false;
#endif
}

} // namespace mrright::sdk::platform
