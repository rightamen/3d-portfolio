// Applying a creator's theme, client side.
//
// The tokens are written through CSSOM -- element.style.setProperty -- and not
// by injecting a <style> element. This site's CSP checks parsed <style>
// elements and style attributes; property writes through the object model are
// not policed, so this needs no nonce and no policy change. (Round 25 is where
// that distinction was worked out the hard way.)
//
// The token NAMES live on the server, in server/themes.js, and arrive with the
// profile. This file only writes what it is handed, and refuses anything that
// is not a custom property -- so a value that somehow got past the API cannot
// set `position` or `content` on the page.

const TOKEN_PATTERN = /^--theme-[a-z-]+$/

// There is no default here on purpose. Tokens always arrive resolved from the
// server, and the un-themed case is covered by the fallback in each var() in
// the stylesheet -- which means one place to change it, not two that can
// disagree about what the site looks like before a theme loads.

/**
 * Writes a theme's tokens onto an element, and returns a function that removes
 * exactly the ones it set. The caller is a React effect, so cleaning up after
 * itself is the whole contract -- a theme left behind when the component
 * unmounts would follow the visitor to the next page.
 */
export const applyTheme = (element, tokens) => {
  if (!element || !tokens) return () => {}

  const written = []
  for (const [name, value] of Object.entries(tokens)) {
    // Not a defensive formality: this is the boundary between "a value the
    // server sent" and "a property on a real element".
    if (!TOKEN_PATTERN.test(name)) continue
    if (typeof value !== 'string' || !value.trim()) continue

    element.style.setProperty(name, value)
    written.push(name)
  }

  return () => {
    for (const name of written) element.style.removeProperty(name)
  }
}
