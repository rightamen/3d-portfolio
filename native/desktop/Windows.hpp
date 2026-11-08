#pragma once
#include "../common/Glb.hpp"
#include "Http.hpp"
#include <d2d1.h>
#include <dwrite.h>
#include <optional>
namespace mr {
struct Pixels {
  UINT width = 0, height = 0;
  std::vector<unsigned char> data;
};
Pixels decodeImage(const std::vector<unsigned char> &, UINT maximum = 2048);
std::filesystem::path appFolder();
std::optional<std::filesystem::path> saveFile(HWND, const std::wstring &);
void openWeb(const Http &, const std::string &);
void openFolder(const std::filesystem::path &);
struct LoginData {
  std::string email, password;
};
struct PublishData {
  std::string title, type;
  std::vector<std::filesystem::path> sources;
  std::filesystem::path cover, preview;
  bool review = true;
  std::string existingId, slug, handle;
};
struct Preferences {
  int language = 0, theme = 0;
  bool motion = true;
};
const wchar_t *label(int language, const char *key);
std::wstring resourceLabel(int language, const std::string &type);
std::optional<LoginData> loginDialog(HWND, int, int);
std::optional<PublishData> publishDialog(HWND, int, int, const Json &existing = Json{});
std::optional<Preferences> settingsDialog(HWND, const Preferences &);
void showModel(HWND, std::shared_ptr<Model>, const std::wstring &);
void showPicture(HWND, const Pixels &, const std::wstring &);
} // namespace mr
