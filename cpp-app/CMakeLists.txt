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

add_library(mrright_sdk_core INTERFACE)
target_include_directories(mrright_sdk_core INTERFACE ${CMAKE_CURRENT_SOURCE_DIR})
target_compile_features(mrright_sdk_core INTERFACE cxx_std_20)

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

enable_testing()
add_test(NAME mrright_cpp_smoke COMMAND mrright_cpp_smoke)
add_test(NAME mrright_cpp_sdk_tests COMMAND mrright_cpp_sdk_tests)

if(MSVC)
  target_compile_options(mrright_app_platform PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_smoke PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_sdk_tests PRIVATE /W4 /utf-8)
  if(TARGET mrright_sdk_curl_http)
    target_compile_options(mrright_sdk_curl_http PRIVATE /W4 /utf-8)
  endif()
else()
  target_compile_options(mrright_app_platform PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_smoke PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_sdk_tests PRIVATE -Wall -Wextra -Wpedantic)
  if(TARGET mrright_sdk_curl_http)
    target_compile_options(mrright_sdk_curl_http PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endif()
