#include "Catalogue.hpp"
#include <cstdlib>
#include <httplib.h>
#include <iostream>
#include <stdexcept>
#include <vector>
#ifndef MR_REVISION
#define MR_REVISION "development"
#endif
namespace {
std::string parameter(const httplib::Request &r, const char *name) {
  return r.has_param(name) ? r.get_param_value(name) : "";
}
void json(httplib::Response &r, std::string value, int status = 200) {
  r.status = status;
  r.set_content(std::move(value), "application/json; charset=utf-8");
  r.set_header("Cache-Control", "no-store");
  r.set_header("X-Content-Type-Options", "nosniff");
  r.set_header("X-MR-Runtime", "cpp20");
  r.set_header("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
}
void error(httplib::Response &r, int status, const char *code, const char *message) {
  json(r,
       std::string("{\"data\":null,\"pagination\":{},\"error\":{\"code\":\"") + code +
           "\",\"message\":\"" + message + "\"}}",
       status);
}
} // namespace
int main() {
  const char *dsn = std::getenv("NATIVE_DATABASE_URL");
  if (!dsn || !*dsn) {
    std::cerr << "NATIVE_DATABASE_URL is required [missing]\n";
    return 2;
  }
  int port = 4286;
  try {
    if (const char *p = std::getenv("NATIVE_PORT"))
      port = mr::integer(p, 4286, 1024, 65535);
  } catch (...) {
    std::cerr << "Invalid NATIVE_PORT\n";
    return 2;
  }
  mr::Catalogue catalogue(dsn);
  httplib::Server server;
  server.new_task_queue = []() { return new httplib::ThreadPool(4, 4, 64); };
  server.set_payload_max_length(4096);
  server.set_read_timeout(5, 0);
  server.set_write_timeout(10, 0);
  server.set_keep_alive_max_count(16);
  server.Get("/api/native/v1/health", [&](const auto &, auto &r) {
    const bool ready = catalogue.ready();
    json(r,
         std::string("{\"data\":{\"ok\":") + (ready ? "true" : "false") +
             ",\"service\":\"mrright-native-catalogue\",\"runtime\":\"cpp20\",\"revision\":"
             "\"" MR_REVISION "\"},\"pagination\":{},\"error\":null}",
         ready ? 200 : 503);
  });
  server.Get("/api/native/v1/works", [&](const httplib::Request &r, httplib::Response &out) {
    try {
      if (r.has_param("status") && r.get_param_value("status") != "published")
        throw std::invalid_argument("status");
      const auto exhibition = parameter(r, "exhibition");
      if (!exhibition.empty() && exhibition != "true" && exhibition != "false")
        throw std::invalid_argument("exhibition");
      mr::Filters f;
      f.type = parameter(r, "resourceType");
      f.category = parameter(r, "category");
      f.query = parameter(r, "q");
      f.creator = parameter(r, "creator");
      f.limit = mr::integer(parameter(r, "limit"), 24, 1, 60);
      f.page = mr::integer(parameter(r, "page"), 1, 1, 10000);
      f.exhibition = exhibition == "true";
      json(out, catalogue.list(f));
    } catch (const std::invalid_argument &) {
      error(out, 400, "VALIDATION_ERROR", "Invalid catalogue filter or pagination.");
    } catch (...) {
      error(out, 503, "SERVICE_UNAVAILABLE", "The catalogue is temporarily unavailable.");
    }
  });
  server.Get(R"(/api/native/v1/works/([A-Za-z0-9_-]{1,60})/([A-Za-z0-9_-]{1,160}))",
             [&](const httplib::Request &r, httplib::Response &out) {
               try {
                 auto value = catalogue.detail(r.matches[1], r.matches[2]);
                 if (value.empty())
                   error(out, 404, "WORK_NOT_FOUND", "Work not found.");
                 else
                   json(out, std::move(value));
               } catch (...) {
                 error(out, 503, "SERVICE_UNAVAILABLE",
                       "The catalogue is temporarily unavailable.");
               }
             });
  server.set_error_handler([](const auto &, auto &r) {
    if (r.body.empty())
      error(r, 404, "NOT_FOUND", "Native route not found.");
  });
  std::cout << "mrright-native-catalogue cpp20 listening on 127.0.0.1:" << port
            << " revision " MR_REVISION "\n";
  return server.listen("127.0.0.1", port) ? 0 : 1;
}
