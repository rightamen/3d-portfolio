#pragma once
#include <windows.h>
namespace mr {
// Keeps a real single-line EDIT (password, IME, caret and accessibility intact).
void centerInput(HWND edit);
} // namespace mr
