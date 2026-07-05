#include "app/platform/AppPaths.hpp"
#include "sdk/models/ApiError.hpp"
#include "sdk/models/Pagination.hpp"
#include "sdk/models/ResponseEnvelope.hpp"

#include <iostream>
#include <string>

int main() {
  using mrright::app::platform::AppPaths;
  using mrright::sdk::models::ApiError;
  using mrright::sdk::models::ApiErrorCode;
  using mrright::sdk::models::Pagination;
  using mrright::sdk::models::ResponseEnvelope;

  std::cout << "mrright.blog C++ SDK skeleton 0.1.0\n";
  std::cout << "network: disabled in smoke binary\n";

  Pagination pagination;
  pagination.page = 1;
  pagination.limit = 20;
  pagination.total = 1;
  pagination.pages = 1;
  pagination.hasNext = false;
  pagination.hasPrevious = false;

  ApiError error{
    "VALIDATION_ERROR",
    ApiErrorCode::ValidationError,
    "Example error; smoke binary does not contact the API.",
    400
  };

  ResponseEnvelope<std::string> envelope;
  envelope.data = "strict /api/v1 envelope placeholder";
  envelope.pagination = pagination;
  envelope.error = error;

  const AppPaths paths;
  std::cout << "base envelope data: " << envelope.data.value_or("") << "\n";
  std::cout << "example error code: " << envelope.error->code << "\n";
  std::cout << "cache dir placeholder: " << paths.cacheDir().string() << "\n";

  return 0;
}
