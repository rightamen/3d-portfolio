#include "sdk/platform/MacOSKeychainTokenStore.hpp"

#ifdef __APPLE__

#include <CoreFoundation/CoreFoundation.h>

#include <cstdint>
#include <memory>
#include <new>
#include <type_traits>
#include <utility>

namespace mrright::sdk::platform {
namespace {

constexpr char kDefaultService[] = "mrright.blog";
constexpr char kDefaultAccount[] = "visitor_token";

struct CFReleaseDeleter {
  void operator()(CFTypeRef value) const {
    if (value != nullptr) CFRelease(value);
  }
};

using CFDictionaryPtr = std::unique_ptr<std::remove_pointer_t<CFMutableDictionaryRef>, CFReleaseDeleter>;
using CFDataPtr = std::unique_ptr<std::remove_pointer_t<CFDataRef>, CFReleaseDeleter>;
using CFStringPtr = std::unique_ptr<std::remove_pointer_t<CFStringRef>, CFReleaseDeleter>;

std::string statusMessage(const char* operation, OSStatus status) {
  return std::string(operation) + " failed in macOS Keychain (OSStatus " + std::to_string(status) + ")";
}

CFStringPtr makeString(const std::string& value) {
  return CFStringPtr(CFStringCreateWithCString(kCFAllocatorDefault, value.c_str(), kCFStringEncodingUTF8));
}

CFDataPtr makeData(const std::string& value) {
  return CFDataPtr(CFDataCreate(
    kCFAllocatorDefault,
    reinterpret_cast<const UInt8*>(value.data()),
    static_cast<CFIndex>(value.size())
  ));
}

void setString(CFMutableDictionaryRef dictionary, const void* key, const std::string& value) {
  auto string = makeString(value);
  if (!string) throw std::bad_alloc();
  CFDictionarySetValue(dictionary, key, string.get());
}

CFDictionaryPtr makeBaseQuery(const std::string& service, const std::string& account) {
  auto query = CFDictionaryPtr(CFDictionaryCreateMutable(
    kCFAllocatorDefault,
    0,
    &kCFTypeDictionaryKeyCallBacks,
    &kCFTypeDictionaryValueCallBacks
  ));
  if (!query) throw std::bad_alloc();

  CFDictionarySetValue(query.get(), kSecClass, kSecClassGenericPassword);
  setString(query.get(), kSecAttrService, service);
  setString(query.get(), kSecAttrAccount, account);
  return query;
}

CFDictionaryPtr makeAttributesWithToken(const std::string& token) {
  auto attributes = CFDictionaryPtr(CFDictionaryCreateMutable(
    kCFAllocatorDefault,
    0,
    &kCFTypeDictionaryKeyCallBacks,
    &kCFTypeDictionaryValueCallBacks
  ));
  if (!attributes) throw std::bad_alloc();

  auto data = makeData(token);
  if (!data) throw std::bad_alloc();
  CFDictionarySetValue(attributes.get(), kSecValueData, data.get());
  return attributes;
}

} // namespace

MacOSKeychainError::MacOSKeychainError(const char* operation, OSStatus status)
  : std::runtime_error(statusMessage(operation, status)), status_(status) {}

OSStatus MacOSKeychainError::status() const {
  return status_;
}

MacOSKeychainTokenStore::MacOSKeychainTokenStore()
  : service_(kDefaultService), account_(kDefaultAccount) {}

MacOSKeychainTokenStore::MacOSKeychainTokenStore(std::string service, std::string account)
  : service_(std::move(service)), account_(std::move(account)) {}

std::optional<std::string> MacOSKeychainTokenStore::loadVisitorToken() {
  auto query = makeBaseQuery(service_, account_);
  CFDictionarySetValue(query.get(), kSecReturnData, kCFBooleanTrue);
  CFDictionarySetValue(query.get(), kSecMatchLimit, kSecMatchLimitOne);

  CFTypeRef result = nullptr;
  const OSStatus status = SecItemCopyMatching(query.get(), &result);
  if (status == errSecItemNotFound) return std::nullopt;
  if (status != errSecSuccess) throw MacOSKeychainError("SecItemCopyMatching", status);

  CFDataPtr data(static_cast<CFDataRef>(result));
  if (CFGetTypeID(data.get()) != CFDataGetTypeID()) {
    throw MacOSKeychainError("SecItemCopyMatching", errSecInvalidItemRef);
  }

  const auto* bytes = CFDataGetBytePtr(data.get());
  const auto length = CFDataGetLength(data.get());
  if (bytes == nullptr || length <= 0) return std::nullopt;

  return std::string(
    reinterpret_cast<const char*>(bytes),
    static_cast<std::size_t>(length)
  );
}

void MacOSKeychainTokenStore::saveVisitorToken(const std::string& token) {
  if (token.empty()) {
    clearVisitorToken();
    return;
  }

  auto query = makeBaseQuery(service_, account_);
  auto attributes = makeAttributesWithToken(token);

  OSStatus status = SecItemUpdate(query.get(), attributes.get());
  if (status == errSecItemNotFound) {
    auto addQuery = makeBaseQuery(service_, account_);
    auto data = makeData(token);
    if (!data) throw std::bad_alloc();
    CFDictionarySetValue(addQuery.get(), kSecValueData, data.get());
    status = SecItemAdd(addQuery.get(), nullptr);
  }

  if (status != errSecSuccess) throw MacOSKeychainError("SecItemUpdate/SecItemAdd", status);
}

void MacOSKeychainTokenStore::clearVisitorToken() {
  auto query = makeBaseQuery(service_, account_);
  const OSStatus status = SecItemDelete(query.get());
  if (status == errSecItemNotFound) return;
  if (status != errSecSuccess) throw MacOSKeychainError("SecItemDelete", status);
}

bool MacOSKeychainTokenStore::hasVisitorToken() {
  return loadVisitorToken().has_value();
}

} // namespace mrright::sdk::platform

#endif // __APPLE__
