// Which files under public/uploads/ have no database row pointing at them.
//
// A file lands on disk the moment multer finishes writing it, but the row
// that would claim it is only written later -- when a community post is
// submitted, a profile save completes, a project override is saved. Abandon
// that flow after the upload and the file stays forever: nothing in this
// codebase ever deletes an upload. So "orphaned" is not a bug to fix here,
// it is a measurement, and the measurement has to be conservative -- a file
// wrongly called orphaned is a candidate for deletion in some later tool,
// so this errs toward "still referenced" whenever a comparison is ambiguous.
//
// This module does no I/O. It takes the two facts that matter -- what is on
// disk, and what the database still points at -- as plain data, and returns
// the files in the first set that are not in the second. Callers assemble
// those facts (scripts/find-orphaned-uploads.mjs is the only one so far).

// A DB column and a filesystem walk can name the same file two different
// ways: one with a trailing slash, one without; one already decoded, one
// still percent-encoded (a Chinese filename in particular). None of that is
// a different file, so both sides are folded through the same normalisation
// before they are compared. What is deliberately NOT folded: case. Uploads
// are served from a case-sensitive filesystem, so a case difference is a
// different file, not the same one spelled differently.
export const normalizeUploadPath = (value) => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null

  let decoded = trimmed
  try {
    decoded = decodeURI(trimmed)
  } catch {
    // Not valid percent-encoding -- compare it as written rather than throw.
    decoded = trimmed
  }

  const withoutQuery = decoded.split('?')[0].split('#')[0]
  const withLeadingSlash = withoutQuery.startsWith('/') ? withoutQuery : `/${withoutQuery}`
  const withoutTrailingSlash = withLeadingSlash.replace(/\/+$/, '')

  return withoutTrailingSlash || '/'
}

// files: [{ path, size, mtimeMs }] -- path is the URL-style path a browser
// would request (e.g. "/uploads/images/foo.png"), not an absolute disk path.
// referencedPaths: Set<string> of every path found in a database column,
// exactly as stored there.
//
// Returns the subset of `files` whose normalised path matches none of
// `referencedPaths`, in the same shape they were given.
export const findOrphanedFiles = ({ files = [], referencedPaths = new Set() } = {}) => {
  const referenced = new Set()
  for (const raw of referencedPaths) {
    const normalized = normalizeUploadPath(raw)
    if (normalized) referenced.add(normalized)
  }

  return files.filter((file) => {
    const normalized = normalizeUploadPath(file?.path)
    // A file this function cannot even identify cannot be vouched for by any
    // reference, so it is reported rather than silently dropped.
    return normalized ? !referenced.has(normalized) : true
  })
}
