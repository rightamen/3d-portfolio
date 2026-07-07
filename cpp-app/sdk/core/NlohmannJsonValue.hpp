#pragma once

#include "sdk/core/ApiResult.hpp"

#include <cstdint>
#include <map>
#include <nlohmann/json.hpp>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <variant>
#include <vector>

namespace mrright::sdk::core {

class JsonValue {
 public:
  using Object = std::map<std::string, JsonValue>;
  using Array = std::vector<JsonValue>;

  JsonValue() = default;
  JsonValue(std::nullptr_t) : value_(nullptr) {}
  JsonValue(bool value) : value_(value) {}
  JsonValue(double value) : value_(value) {}
  JsonValue(std::string value) : value_(std::move(value)) {}
  JsonValue(Object value) : value_(std::move(value)) {}
  JsonValue(Array value) : value_(std::move(value)) {}

  [[nodiscard]] bool isNull() const { return std::holds_alternative<std::nullptr_t>(value_); }
  [[nodiscard]] bool isBool() const { return std::holds_alternative<bool>(value_); }
  [[nodiscard]] bool isNumber() const { return std::holds_alternative<double>(value_); }
  [[nodiscard]] bool isString() const { return std::holds_alternative<std::string>(value_); }
  [[nodiscard]] bool isObject() const { return std::holds_alternative<Object>(value_); }
  [[nodiscard]] bool isArray() const { return std::holds_alternative<Array>(value_); }

  [[nodiscard]] const Object* asObject() const { return std::get_if<Object>(&value_); }
  [[nodiscard]] const Array* asArray() const { return std::get_if<Array>(&value_); }
  [[nodiscard]] const std::string* asString() const { return std::get_if<std::string>(&value_); }
  [[nodiscard]] const bool* asBool() const { return std::get_if<bool>(&value_); }
  [[nodiscard]] const double* asNumber() const { return std::get_if<double>(&value_); }

  [[nodiscard]] const JsonValue* get(std::string_view key) const {
    const auto* object = asObject();
    if (!object) return nullptr;
    const auto found = object->find(std::string(key));
    return found == object->end() ? nullptr : &found->second;
  }

 private:
  std::variant<std::nullptr_t, bool, double, std::string, Object, Array> value_;
};

namespace nlohmann_json_detail {

inline models::ApiError parseError(std::string message) {
  return {"JSON_PARSE_ERROR", models::ApiErrorCode::Unknown, std::move(message), 0};
}

inline ApiResult<JsonValue> convertJsonValue(const nlohmann::json& value) {
  if (value.is_null()) return ApiResult<JsonValue>::ok(JsonValue(nullptr));
  if (value.is_boolean()) return ApiResult<JsonValue>::ok(JsonValue(value.get<bool>()));
  if (value.is_number()) return ApiResult<JsonValue>::ok(JsonValue(value.get<double>()));
  if (value.is_string()) return ApiResult<JsonValue>::ok(JsonValue(value.get<std::string>()));

  if (value.is_array()) {
    JsonValue::Array array;
    array.reserve(value.size());
    for (const auto& item : value) {
      auto converted = convertJsonValue(item);
      if (converted.isError()) return converted;
      array.push_back(*converted.value());
    }
    return ApiResult<JsonValue>::ok(JsonValue(std::move(array)));
  }

  if (value.is_object()) {
    JsonValue::Object object;
    for (const auto& [key, item] : value.items()) {
      auto converted = convertJsonValue(item);
      if (converted.isError()) return converted;
      object.emplace(key, *converted.value());
    }
    return ApiResult<JsonValue>::ok(JsonValue(std::move(object)));
  }

  return ApiResult<JsonValue>::err(parseError("Unsupported JSON value type."));
}

} // namespace nlohmann_json_detail

inline ApiResult<JsonValue> parseJson(std::string_view source) {
  const auto parsed = nlohmann::json::parse(source.begin(), source.end(), nullptr, false);
  if (parsed.is_discarded()) {
    return ApiResult<JsonValue>::err(nlohmann_json_detail::parseError("Invalid JSON."));
  }
  return nlohmann_json_detail::convertJsonValue(parsed);
}

inline std::optional<std::string> jsonString(const JsonValue& value, std::string_view key) {
  const auto* child = value.get(key);
  if (!child) return std::nullopt;
  const auto* text = child->asString();
  if (!text) return std::nullopt;
  return *text;
}

inline std::optional<bool> jsonBool(const JsonValue& value, std::string_view key) {
  const auto* child = value.get(key);
  if (!child) return std::nullopt;
  const auto* boolean = child->asBool();
  if (!boolean) return std::nullopt;
  return *boolean;
}

inline std::optional<std::int64_t> jsonInt(const JsonValue& value, std::string_view key) {
  const auto* child = value.get(key);
  if (!child) return std::nullopt;
  const auto* number = child->asNumber();
  if (!number) return std::nullopt;
  return static_cast<std::int64_t>(*number);
}

inline std::string escapeJsonString(std::string_view value) {
  std::string output;
  for (const char current : value) {
    switch (current) {
      case '"':
        output += "\\\"";
        break;
      case '\\':
        output += "\\\\";
        break;
      case '\n':
        output += "\\n";
        break;
      case '\r':
        output += "\\r";
        break;
      case '\t':
        output += "\\t";
        break;
      default:
        output.push_back(current);
        break;
    }
  }
  return output;
}

} // namespace mrright::sdk::core
