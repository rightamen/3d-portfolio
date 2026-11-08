#pragma once
#include "Windows.hpp"
namespace mr {
constexpr UINT exhibitionMessage = WM_APP + 32;
HWND createExhibition(HWND);
void setExhibition(HWND, const Json &, int selected, int theme, bool motion);
void exhibitionImage(HWND, const std::string &, const Pixels &);
void resetExhibition(HWND);
bool exhibitionHasImage(HWND, const std::string &);
Json exhibitionState(HWND);
void probeExhibition(HWND, bool);
HWND createEmbeddedModel(HWND, std::shared_ptr<Model>);
} // namespace mr
