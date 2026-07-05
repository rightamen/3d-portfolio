#include "sdk/network/CurlHttpClient.hpp"

#include <iostream>

int main() {
  mrright::sdk::core::ApiClientConfig config;
  config.baseUrl = "http://localhost:3000";
  config.timeoutMs = 1000;

  const mrright::sdk::network::CurlHttpClient client(config);
  if (client.config().baseUrl != config.baseUrl || client.config().timeoutMs != config.timeoutMs) {
    std::cerr << "CurlHttpClient did not retain ApiClientConfig\n";
    return 1;
  }

  return 0;
}
