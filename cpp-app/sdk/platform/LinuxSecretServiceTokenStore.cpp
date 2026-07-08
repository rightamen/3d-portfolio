#include "sdk/platform/LinuxSecretServiceTokenStore.hpp"

#if defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)

#include <libsecret/secret.h>

#include <memory>
#include <optional>
#include <string>
#include <utility>

namespace mrright::sdk::platform {
namespace {

constexpr char kDefaultAccount[] = "visitor_token";
constexpr char kSecretLabel[] = "mrright.blog visitor token";

const SecretSchema kVisitorTokenSchema = {
  "mrright.blog",
  SECRET_SCHEMA_NONE,
  {
    {"account", SECRET_SCHEMA_ATTRIBUTE_STRING},
    {nullptr, static_cast<SecretSchemaAttributeType>(0)}
  },
  0,
  nullptr,
  nullptr,
  nullptr,
  nullptr,
  nullptr,
  nullptr,
  nullptr
};

struct GErrorDeleter {
  void operator()(GError* error) const {
    if (error != nullptr) g_error_free(error);
  }
};

struct SecretPasswordDeleter {
  void operator()(gchar* password) const {
    if (password != nullptr) secret_password_free(password);
  }
};

using GErrorPtr = std::unique_ptr<GError, GErrorDeleter>;
using SecretPasswordPtr = std::unique_ptr<gchar, SecretPasswordDeleter>;

std::string errorMessage(const char* operation, const GError* error) {
  std::string message = std::string(operation) + " failed in Linux Secret Service";
  if (error != nullptr && error->message != nullptr) {
    message += ": ";
    message += error->message;
  }
  return message;
}

void throwIfError(const char* operation, GError* rawError) {
  GErrorPtr error(rawError);
  if (error != nullptr) {
    throw LinuxSecretServiceError(operation, errorMessage(operation, error.get()), error->domain, error->code);
  }
}

} // namespace

LinuxSecretServiceError::LinuxSecretServiceError(const char* operation, std::string message, GQuark domain, int code)
  : std::runtime_error(message.empty() ? std::string(operation) + " failed in Linux Secret Service" : std::move(message)),
    domain_(domain),
    code_(code) {}

GQuark LinuxSecretServiceError::domain() const {
  return domain_;
}

int LinuxSecretServiceError::code() const {
  return code_;
}

LinuxSecretServiceTokenStore::LinuxSecretServiceTokenStore()
  : account_(kDefaultAccount) {}

LinuxSecretServiceTokenStore::LinuxSecretServiceTokenStore(std::string account)
  : account_(std::move(account)) {}

std::optional<std::string> LinuxSecretServiceTokenStore::loadVisitorToken() {
  GError* error = nullptr;
  SecretPasswordPtr password(secret_password_lookup_sync(
    &kVisitorTokenSchema,
    nullptr,
    &error,
    "account",
    account_.c_str(),
    nullptr
  ));
  throwIfError("secret_password_lookup_sync", error);

  if (password == nullptr || password.get()[0] == '\0') return std::nullopt;
  return std::string(password.get());
}

void LinuxSecretServiceTokenStore::saveVisitorToken(const std::string& token) {
  if (token.empty()) {
    clearVisitorToken();
    return;
  }

  GError* error = nullptr;
  const gboolean stored = secret_password_store_sync(
    &kVisitorTokenSchema,
    SECRET_COLLECTION_DEFAULT,
    kSecretLabel,
    token.c_str(),
    nullptr,
    &error,
    "account",
    account_.c_str(),
    nullptr
  );
  throwIfError("secret_password_store_sync", error);
  if (!stored) {
    throw LinuxSecretServiceError("secret_password_store_sync", "secret_password_store_sync failed in Linux Secret Service", 0, 0);
  }
}

void LinuxSecretServiceTokenStore::clearVisitorToken() {
  GError* error = nullptr;
  secret_password_clear_sync(
    &kVisitorTokenSchema,
    nullptr,
    &error,
    "account",
    account_.c_str(),
    nullptr
  );
  throwIfError("secret_password_clear_sync", error);
}

bool LinuxSecretServiceTokenStore::hasVisitorToken() {
  return loadVisitorToken().has_value();
}

} // namespace mrright::sdk::platform

#endif // defined(__linux__) && defined(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
