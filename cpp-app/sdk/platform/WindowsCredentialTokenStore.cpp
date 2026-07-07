#include "sdk/platform/WindowsCredentialTokenStore.hpp"

#ifdef _WIN32

#ifndef WIN32_LEAN_AND_MEAN
#define WIN32_LEAN_AND_MEAN
#endif
#include <windows.h>
#include <wincred.h>

#include <stdexcept>
#include <utility>

namespace mrright::sdk::platform {
namespace {

constexpr wchar_t kVisitorTokenTargetName[] = L"mrright.blog.visitor_token";
constexpr wchar_t kCredentialUserName[] = L"mrright.blog";

[[noreturn]] void throwCredentialError(const char* operation) {
  throw std::runtime_error(std::string(operation) + " failed in Windows Credential Manager");
}

} // namespace

WindowsCredentialTokenStore::WindowsCredentialTokenStore()
  : credentialTargetName_(kVisitorTokenTargetName) {}

WindowsCredentialTokenStore::WindowsCredentialTokenStore(std::wstring credentialTargetName)
  : credentialTargetName_(std::move(credentialTargetName)) {}

std::optional<std::string> WindowsCredentialTokenStore::loadVisitorToken() {
  PCREDENTIALW credential = nullptr;
  if (!CredReadW(credentialTargetName_.c_str(), CRED_TYPE_GENERIC, 0, &credential)) {
    if (GetLastError() == ERROR_NOT_FOUND) return std::nullopt;
    throwCredentialError("CredReadW");
  }

  std::string token;
  if (credential->CredentialBlob != nullptr && credential->CredentialBlobSize > 0) {
    token.assign(
      reinterpret_cast<const char*>(credential->CredentialBlob),
      static_cast<std::size_t>(credential->CredentialBlobSize)
    );
  }
  CredFree(credential);

  if (token.empty()) return std::nullopt;
  return token;
}

void WindowsCredentialTokenStore::saveVisitorToken(const std::string& token) {
  if (token.empty()) {
    clearVisitorToken();
    return;
  }

  CREDENTIALW credential{};
  credential.Type = CRED_TYPE_GENERIC;
  credential.TargetName = const_cast<LPWSTR>(credentialTargetName_.c_str());
  credential.CredentialBlobSize = static_cast<DWORD>(token.size());
  credential.CredentialBlob = reinterpret_cast<LPBYTE>(const_cast<char*>(token.data()));
  credential.Persist = CRED_PERSIST_LOCAL_MACHINE;
  credential.UserName = const_cast<LPWSTR>(kCredentialUserName);

  if (!CredWriteW(&credential, 0)) {
    throwCredentialError("CredWriteW");
  }
}

void WindowsCredentialTokenStore::clearVisitorToken() {
  if (!CredDeleteW(credentialTargetName_.c_str(), CRED_TYPE_GENERIC, 0)) {
    if (GetLastError() == ERROR_NOT_FOUND) return;
    throwCredentialError("CredDeleteW");
  }
}

bool WindowsCredentialTokenStore::hasVisitorToken() {
  return loadVisitorToken().has_value();
}

} // namespace mrright::sdk::platform

#endif // _WIN32
