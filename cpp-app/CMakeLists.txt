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
option(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE "Enable Linux Secret Service TokenStore backend via system libsecret-1" ON)
option(MRRIGHT_ENABLE_QT_UI "Enable optional Qt/QML desktop app shell" OFF)
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

add_library(mrright_sdk_platform_tokenstore STATIC
  sdk/platform/SecureTokenStore.cpp
)
target_link_libraries(mrright_sdk_platform_tokenstore PUBLIC mrright_sdk_core)
if(WIN32)
  target_sources(mrright_sdk_platform_tokenstore PRIVATE
    sdk/platform/WindowsCredentialTokenStore.cpp
  )
  target_link_libraries(mrright_sdk_platform_tokenstore PRIVATE Advapi32)
elseif(APPLE)
  find_library(SECURITY_FRAMEWORK Security REQUIRED)
  find_library(COREFOUNDATION_FRAMEWORK CoreFoundation REQUIRED)
  target_sources(mrright_sdk_platform_tokenstore PRIVATE
    sdk/platform/MacOSKeychainTokenStore.cpp
  )
  target_link_libraries(mrright_sdk_platform_tokenstore PUBLIC
    ${SECURITY_FRAMEWORK}
    ${COREFOUNDATION_FRAMEWORK}
  )
elseif(CMAKE_SYSTEM_NAME STREQUAL "Linux")
  if(MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
    find_package(PkgConfig QUIET)
    if(NOT PkgConfig_FOUND)
      message(FATAL_ERROR "MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON requires pkg-config to find system libsecret-1. Install pkg-config and libsecret-1 development headers, or configure with -DMRRIGHT_ENABLE_LINUX_SECRET_SERVICE=OFF for an explicit unsupported Linux secure TokenStore.")
    endif()
    pkg_check_modules(LIBSECRET IMPORTED_TARGET libsecret-1)
    if(NOT LIBSECRET_FOUND)
      message(FATAL_ERROR "MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=ON requires system libsecret-1 development headers. Install libsecret-1-dev or the distro equivalent, or configure with -DMRRIGHT_ENABLE_LINUX_SECRET_SERVICE=OFF for an explicit unsupported Linux secure TokenStore.")
    endif()
    target_sources(mrright_sdk_platform_tokenstore PRIVATE
      sdk/platform/LinuxSecretServiceTokenStore.cpp
    )
    target_compile_definitions(mrright_sdk_platform_tokenstore PUBLIC MRRIGHT_ENABLE_LINUX_SECRET_SERVICE)
    target_link_libraries(mrright_sdk_platform_tokenstore PUBLIC PkgConfig::LIBSECRET)
  else()
    message(STATUS "Linux Secret Service TokenStore backend disabled by MRRIGHT_ENABLE_LINUX_SECRET_SERVICE=OFF.")
  endif()
endif()

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

add_executable(mrright_cpp_secure_tokenstore_tests
  tests/unit/secure_tokenstore_tests.cpp
)
target_link_libraries(mrright_cpp_secure_tokenstore_tests PRIVATE mrright_sdk_platform_tokenstore)

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
add_test(NAME mrright_cpp_secure_tokenstore_tests COMMAND mrright_cpp_secure_tokenstore_tests)
set_tests_properties(mrright_cpp_secure_tokenstore_tests PROPERTIES SKIP_RETURN_CODE 77)
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

if(MRRIGHT_ENABLE_QT_UI)
  find_package(Qt6 COMPONENTS Core Gui Qml Quick REQUIRED)
  qt_standard_project_setup()

  set_source_files_properties(app/ui/qt/Main.qml PROPERTIES
    QT_RESOURCE_ALIAS Main.qml
  )

  qt_add_executable(mrright_qt_shell
    app/ui/qt/main_qt.cpp
    app/ui/qt/AuthService.hpp
    app/ui/qt/AuthSessionService.cpp
    app/ui/qt/AuthSessionService.hpp
    app/ui/qt/AppController.cpp
    app/ui/qt/AppController.hpp
    app/ui/qt/MockAuthService.cpp
    app/ui/qt/MockAuthService.hpp
  )
  target_link_libraries(mrright_qt_shell PRIVATE
    mrright_sdk_core
    Qt6::Core
    Qt6::Gui
    Qt6::Qml
    Qt6::Quick
  )
  qt_add_qml_module(mrright_qt_shell
    URI Mrright.QtShell
    VERSION 1.0
    QML_FILES
      app/ui/qt/Main.qml
  )

  add_executable(mrright_qt_appcontroller_tests
    tests/unit/qt_appcontroller_tests.cpp
    app/ui/qt/AuthService.hpp
    app/ui/qt/AuthSessionService.cpp
    app/ui/qt/AuthSessionService.hpp
    app/ui/qt/AppController.cpp
    app/ui/qt/AppController.hpp
    app/ui/qt/MockAuthService.cpp
    app/ui/qt/MockAuthService.hpp
  )
  set_target_properties(mrright_qt_appcontroller_tests PROPERTIES
    AUTOMOC ON
  )
  target_link_libraries(mrright_qt_appcontroller_tests PRIVATE
    mrright_sdk_core
    Qt6::Core
  )
  add_test(NAME mrright_qt_appcontroller_tests COMMAND mrright_qt_appcontroller_tests)

  add_executable(mrright_qt_authsession_service_tests
    tests/unit/qt_authsession_service_tests.cpp
    app/ui/qt/AuthService.hpp
    app/ui/qt/AuthSessionService.cpp
    app/ui/qt/AuthSessionService.hpp
  )
  target_link_libraries(mrright_qt_authsession_service_tests PRIVATE
    mrright_sdk_core
    Qt6::Core
  )
  add_test(NAME mrright_qt_authsession_service_tests COMMAND mrright_qt_authsession_service_tests)
endif()

if(MSVC)
  target_compile_options(mrright_app_platform PRIVATE /W4 /utf-8)
  target_compile_options(mrright_sdk_platform_tokenstore PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_smoke PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_sdk_tests PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_tokenstore_tests PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_auth_session_tests PRIVATE /W4 /utf-8)
  target_compile_options(mrright_cpp_secure_tokenstore_tests PRIVATE /W4 /utf-8)
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
  if(TARGET mrright_qt_shell)
    target_compile_options(mrright_qt_shell PRIVATE /W4 /utf-8)
  endif()
  if(TARGET mrright_qt_appcontroller_tests)
    target_compile_options(mrright_qt_appcontroller_tests PRIVATE /W4 /utf-8)
  endif()
  if(TARGET mrright_qt_authsession_service_tests)
    target_compile_options(mrright_qt_authsession_service_tests PRIVATE /W4 /utf-8)
  endif()
else()
  target_compile_options(mrright_app_platform PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_sdk_platform_tokenstore PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_smoke PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_sdk_tests PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_tokenstore_tests PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_auth_session_tests PRIVATE -Wall -Wextra -Wpedantic)
  target_compile_options(mrright_cpp_secure_tokenstore_tests PRIVATE -Wall -Wextra -Wpedantic)
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
  if(TARGET mrright_qt_shell)
    target_compile_options(mrright_qt_shell PRIVATE -Wall -Wextra -Wpedantic)
  endif()
  if(TARGET mrright_qt_appcontroller_tests)
    target_compile_options(mrright_qt_appcontroller_tests PRIVATE -Wall -Wextra -Wpedantic)
  endif()
  if(TARGET mrright_qt_authsession_service_tests)
    target_compile_options(mrright_qt_authsession_service_tests PRIVATE -Wall -Wextra -Wpedantic)
  endif()
endif()
