cmake_minimum_required(VERSION 3.20)

project(
  mrright_cpp_app
  VERSION 0.1.0
  DESCRIPTION "mrright.blog cross-platform C++ SDK skeleton"
  LANGUAGES CXX
)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

option(MRRIGHT_ENABLE_CURL_HTTP "Enable future libcurl-backed HttpClient implementation" OFF)
option(MRRIGHT_ENABLE_LOCAL_API_SMOKE "Enable opt-in local/dev API smoke tests that perform loopback HTTP requests" OFF)
option(MRRIGHT_USE_TEMPORARY_JSON "Use the dependency-free temporary JsonValue parser fallback instead of the default nlohmann/json backend" OFF)

if(MRRIGHT_ENABLE_LOCAL_API_SMOKE AND NOT MRRIGHT_ENABLE_CURL_HTTP)
  message(FATAL_ERROR "MRRIGHT_ENABLE_LOCAL_API_SMOKE=ON requires MRRIGHT_ENABLE_CURL_HTTP=ON.")
endif()

add_library(mrright_sdk_core INTERFACE)
target_include_directories(mrright_sdk_core INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_features(mrright_sdk_core INTERFACE cxx_std_20)

if(MRRIGHT_USE_TEMPORARY_JSON)
  target_compile_definitions(mrright_sdk_core INTERFACE MRRIGHT_USE_TEMPORARY_JSON)
else()
  find_package(nlohmann_json CONFIG REQUIRED)
  target_compile_definitions(mrright_sdk_core INTERFACE MRRIGHT_USE_NLOHMANN_JSON)
  target_link_libraries(mrright_sdk_core INTERFACE nlohmann_json::nlohmann_json)
endif()

if(MRRIGHT_ENABLE_CURL_HTTP)
  find_package(CURL CONFIG QUIET)
  if(NOT CURL_FOUND)
    find_package(CURL QUIET)
  endif()
  if(NOT CURL_FOUND)
    message(FATAL_ERROR "MRRIGHT_ENABLE_CURL_HTTP=ON requires libcurl. Use the vcpkg toolchain with cpp-app/vcpkg.json or install a curl development package that provides CURL::libcurl.")
  endif()

  add_library(mrright_sdk_curl_http STATIC
    sdk/network/CurlHttpClient.cpp
  )
  target_link_libraries(mrright_sdk_curl_http PUBLIC mrright_sdk_core CURL::libcurl)

  add_executable(mrright_cpp_curl_compile_tests
    tests/unit/curl_http_compile_tests.cpp
  )
  target_link_libraries(mrright_cpp_curl_compile_tests PRIVATE mrright_sdk_curl_http)

  if(MRRIGHT_ENABLE_LOCAL_API_SMOKE)
    add_executable(mrright_cpp_local_api_smoke
      tests/integration/local_api_smoke.cpp
    )
    target_link_libraries(mrright_cpp_local_api_smoke PRIVATE mrright_sdk_curl_http)
  endif()
endif()

add_library(mrright_app_platform STATIC
  app/platform/AppPaths.cpp
)
target_link_libraries(mrright_app_platform PUBLIC mrright_sdk_core)

add_executable(mrright_cpp_smoke
  src/main.cpp
)
target_link_libraries(mrright_cpp_smoke PRIVATE mrright_sdk_core mrright_app_platform)

add_executable(mrright_cpp_sdk_tests
  tests/unit/sdk_contract_tests.cpp
)
target_link_libraries(mrright_cpp_sdk_tests PRIVATE mrright_sdk_core)

add_executable(mrright_cpp_tokenstore_tests
  tests/unit/tokenstore_tests.cpp
)
target_link_libraries(mrright_cpp_tokenstore_tests PRIVATE mrright_sdk_core)

add_executable(mrright_cpp_auth_session_tests
  tests/unit/auth_session_tests.cpp
)
target_link_libraries(mrright_cpp_auth_session_tests PRIVATE mrright_sdk_core)

if(NOT MRRIGHT_USE_TEMPORARY_JSON)
  add_executable(mrright_cpp_nlohmann_json_tests
    tests/unit/nlohmann_json_parser_tests.cpp
  )
  target_link_libraries(mrright_cpp_nlohmann_json_tests PRIVATE mrright_sdk_core)
endif()

enable_testing()
add_test(NAME mrright_cpp_smoke COMMAND mrright_cpp_smoke)
add_test(NAME mrright_cpp_sdk_tests COMMAND mrright_cpp_sdk_tests)
add_test(NAME mrright_cpp_tokenstore_tests COMMAND mrright_cpp_tokenstore_tests)
add_test(NAME mrright_cpp_auth_session_tests COMMAND mrright_cpp_auth_session_tests)
if(TARGET mrright_cpp_nlohmann_json_tests)
  add_test(NAME mrright_cpp_nlohmann_json_tests COMMAND mrright_cpp_nlohmann_json_tests)
endif()
if(TARGET mrright_cpp_curl_compile_tests)
  add_test(NAME mrright_cpp_curl_compile_tests COMMAND mrright_cpp_curl_compile_tests)
endif()
if(TARGET mrright_cpp_local_api_smoke)
  add_test(NAME mrright_cpp_local_api_smoke COMMAND mrright_cpp_local_api_smoke)
  set_tests_properties(mrright_cpp_local_api_smoke PROPERTIES SKIP_RETURN_CODE 77)
endif()

if(MSVC)
  target_compile_options(mrright_app_platform PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_smoke PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_sdk_tests PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_tokenstore_tests PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_auth_session_tests PRIVATE /W4 /utf-8)
  if(TARGET mrright_cpp_nlohmann_json_tests)
    target_compile_options(mrright_cpp_nlohmann_json_tests PRIVATE /W4 /utf-8)
  endif()
  if(TARGET mrright_sdk_curl_http)
    target_compile_options(mrright_sdk_curl_http PRIVATE /W4 /utf-8)
  endif()
  if(TARGET mrright_cpp_curl_compile_tests)
    target_compile_options(mrright_cpp_curl_compile_tests PRIVATE /W4 /utf-8)
  endif()
  if(TARGET mrright_cpp_local_api_smoke)
    target_compile_options(mrright_cpp_local_api_smoke PRIVATE /W4 /utf-8)
  endif()
else()
  target_compile_options(mrright_app_platform PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_smoke PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_sdk_tests PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_tokenstore_tests PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_auth_session_tests PRIVATE -Wall -Wextra -Wpedantic)
  if(TARGET mrright_cpp_nlohmann_json_tests)
    target_compile_options(mrright_cpp_nlohmann_json_tests PRIVATE -Wall -Wextra -Wpedantic)
  endif()
  if(TARGET mrright_sdk_curl_http)
    target_compile_options(mrright_sdk_curl_http PRIVATE -Wall -Wextra -Wpedantic)
  endif()
  if(TARGET mrright_cpp_curl_compile_tests)
    target_compile_options(mrright_cpp_curl_compile_tests PRIVATE -Wall -Wextra -Wpedantic)
  endif()
  if(TARGET mrright_cpp_local_api_smoke)
    target_compile_options(mrright_cpp_local_api_smoke PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endif()
