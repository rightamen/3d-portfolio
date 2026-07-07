#pragma once

#ifdef MRRIGHT_USE_TEMPORARY_JSON

#include "sdk/core/ApiResult.hpp"

#include <cctype>
#include <cstdint>
#include <cstdlib>
#include <map>
#include <optional>
#include <string>
#include <string_view>
#include <utility>
#include <variant>
#include <vector>

namespace mrright::sdk::core {

// Temporary prototype JSON boundary for early SDK contract tests.
// Keep JSON access behind EnvelopeParser/typed decoders; do not expand this
// into a production JSON library. See docs/adr/ADR_CPP_JSON_STRATEGY.md.
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

namespace json_detail {

inline models::ApiError parseError(std::string message) {
  return {"JSON_PARSE_ERROR", models::ApiErrorCode::Unknown, std::move(message), 0};
}

class Parser {
 public:
  explicit Parser(std::string_view source) : source_(source) {}

  ApiResult<JsonValue> parse() {
    skipWhitespace();
    auto value = parseValue();
    if (value.isError()) return value;
    skipWhitespace();
    if (!isAtEnd()) return fail("Unexpected trailing characters after JSON value.");
    return value;
  }

 private:
  ApiResult<JsonValue> fail(std::string message) const {
    return ApiResult<JsonValue>::err(parseError(std::move(message)));
  }

  [[nodiscard]] bool isAtEnd() const { return position_ >= source_.size(); }

  [[nodiscard]] char peek() const {
    return isAtEnd() ? '\0' : source_[position_];
  }

  char advance() {
    return isAtEnd() ? '\0' : source_[position_++];
  }

  void skipWhitespace() {
    while (!isAtEnd() && std::isspace(static_cast<unsigned char>(peek())) != 0) {
      ++position_;
    }
  }

  bool consume(std::string_view literal) {
    if (source_.substr(position_, literal.size()) != literal) return false;
    position_ += literal.size();
    return true;
  }

  ApiResult<JsonValue> parseValue() {
    skipWhitespace();
    if (isAtEnd()) return fail("Unexpected end of JSON input.");

    const char current = peek();
    if (current == '{') return parseObject();
    if (current == '[') return parseArray();
    if (current == '"') return parseStringValue();
    if (current == '-' || std::isdigit(static_cast<unsigned char>(current)) != 0) return parseNumber();
    if (consume("true")) return ApiResult<JsonValue>::ok(JsonValue(true));
    if (consume("false")) return ApiResult<JsonValue>::ok(JsonValue(false));
    if (consume("null")) return ApiResult<JsonValue>::ok(JsonValue(nullptr));
    return fail("Unexpected token while parsing JSON value.");
  }

  ApiResult<std::string> parseString() {
    if (advance() != '"') {
      return ApiResult<std::string>::err(parseError("Expected string opening quote."));
    }

    std::string output;
    while (!isAtEnd()) {
      const char current = advance();
      if (current == '"') return ApiResult<std::string>::ok(std::move(output));
      if (current == '\\') {
        if (isAtEnd()) return ApiResult<std::string>::err(parseError("Unterminated JSON string escape."));
        const char escaped = advance();
        switch (escaped) {
          case '"':
          case '\\':
          case '/':
            output.push_back(escaped);
            break;
          case 'b':
            output.push_back('\b');
            break;
          case 'f':
            output.push_back('\f');
            break;
          case 'n':
            output.push_back('\n');
            break;
          case 'r':
            output.push_back('\r');
            break;
          case 't':
            output.push_back('\t');
            break;
          case 'u':
            // Placeholder unicode handling: preserve ASCII-compatible tests
            // without pretending to implement full UTF-16 decoding yet.
            if (position_ + 4 > source_.size()) {
              return ApiResult<std::string>::err(parseError("Invalid JSON unicode escape."));
            }
            output.append("\\u");
            output.append(source_.substr(position_, 4));
            position_ += 4;
            break;
          default:
            return ApiResult<std::string>::err(parseError("Unsupported JSON string escape."));
        }
      } else {
        output.push_back(current);
      }
    }

    return ApiResult<std::string>::err(parseError("Unterminated JSON string."));
  }

  ApiResult<JsonValue> parseStringValue() {
    auto value = parseString();
    if (value.isError()) return ApiResult<JsonValue>::err(*value.error());
    return ApiResult<JsonValue>::ok(JsonValue(*value.value()));
  }

  ApiResult<JsonValue> parseNumber() {
    const std::size_t start = position_;
    if (peek() == '-') advance();
    while (std::isdigit(static_cast<unsigned char>(peek())) != 0) advance();
    if (peek() == '.') {
      advance();
      while (std::isdigit(static_cast<unsigned char>(peek())) != 0) advance();
    }
    if (peek() == 'e' || peek() == 'E') {
      advance();
      if (peek() == '+' || peek() == '-') advance();
      while (std::isdigit(static_cast<unsigned char>(peek())) != 0) advance();
    }

    const auto token = std::string(source_.substr(start, position_ - start));
    char* end = nullptr;
    const double number = std::strtod(token.c_str(), &end);
    if (end == token.c_str() || *end != '\0') return fail("Invalid JSON number.");
    return ApiResult<JsonValue>::ok(JsonValue(number));
  }

  ApiResult<JsonValue> parseObject() {
    advance();
    JsonValue::Object object;
    skipWhitespace();
    if (peek() == '}') {
      advance();
      return ApiResult<JsonValue>::ok(JsonValue(std::move(object)));
    }

    while (!isAtEnd()) {
      skipWhitespace();
      if (peek() != '"') return fail("Expected JSON object key.");
      auto key = parseString();
      if (key.isError()) return ApiResult<JsonValue>::err(*key.error());

      skipWhitespace();
      if (advance() != ':') return fail("Expected ':' after JSON object key.");

      auto value = parseValue();
      if (value.isError()) return value;
      object.emplace(*key.value(), *value.value());

      skipWhitespace();
      const char separator = advance();
      if (separator == '}') return ApiResult<JsonValue>::ok(JsonValue(std::move(object)));
      if (separator != ',') return fail("Expected ',' or '}' in JSON object.");
    }

    return fail("Unterminated JSON object.");
  }

  ApiResult<JsonValue> parseArray() {
    advance();
    JsonValue::Array array;
    skipWhitespace();
    if (peek() == ']') {
      advance();
      return ApiResult<JsonValue>::ok(JsonValue(std::move(array)));
    }

    while (!isAtEnd()) {
      auto value = parseValue();
      if (value.isError()) return value;
      array.push_back(*value.value());

      skipWhitespace();
      const char separator = advance();
      if (separator == ']') return ApiResult<JsonValue>::ok(JsonValue(std::move(array)));
      if (separator != ',') return fail("Expected ',' or ']' in JSON array.");
    }

    return fail("Unterminated JSON array.");
  }

  std::string_view source_;
  std::size_t position_ = 0;
};

} // namespace json_detail

inline ApiResult<JsonValue> parseJson(std::string_view source) {
  return json_detail::Parser(source).parse();
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

#else

#include "sdk/core/NlohmannJsonValue.hpp"

#endif
