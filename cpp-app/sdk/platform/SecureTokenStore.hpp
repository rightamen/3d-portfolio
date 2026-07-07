#pragma once

#include "sdk/core/TokenStore.hpp"

#include <memory>

namespace mrright::sdk::platform {

// Creates the platform secure visitor-token store when this platform has a
// supported implementation. Unsupported platforms return nullptr explicitly.
std::unique_ptr<core::TokenStore> createPlatformSecureTokenStore();

[[nodiscard]] bool isPlatformSecureTokenStoreSupported();

} // namespace mrright::sdk::platform
