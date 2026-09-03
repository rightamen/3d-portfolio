import { describe, expect, it } from 'vitest'

import { findOrphanedFiles, normalizeUploadPath } from '../../server/orphanedUploads.js'

// findOrphanedFiles decides which uploaded files nothing in the database
// references any more -- the only measurement scripts/find-orphaned-uploads.mjs
// takes before it prints a report. Nothing here is ever wired to a delete, but
// a false positive is still the dangerous direction: it is the input a human
// reads before deciding what to remove by hand. So the cases below lean on the
// ways a real file could be wrongly called orphaned -- a stray slash, percent
// encoding, a bug in one column's extraction -- rather than only the easy case
// of "unreferenced file gets flagged".

describe('findOrphanedFiles', () => {
  it('never flags a file a database column points at', () => {
    const files = [{ mtimeMs: 1, path: '/uploads/images/kept.png', size: 10 }]
    const referencedPaths = new Set(['/uploads/images/kept.png'])

    expect(findOrphanedFiles({ files, referencedPaths })).toEqual([])
  })

  it('flags a file nothing points at', () => {
    const files = [{ mtimeMs: 1, path: '/uploads/images/abandoned.png', size: 10 }]

    expect(findOrphanedFiles({ files, referencedPaths: new Set() })).toEqual(files)
  })

  it('matches exactly, so a different file in the same folder is unaffected', () => {
    const files = [
      { mtimeMs: 1, path: '/uploads/images/a.png', size: 10 },
      { mtimeMs: 1, path: '/uploads/images/ab.png', size: 10 },
    ]
    const referencedPaths = new Set(['/uploads/images/a.png'])

    const orphans = findOrphanedFiles({ files, referencedPaths })
    expect(orphans).toEqual([{ mtimeMs: 1, path: '/uploads/images/ab.png', size: 10 }])
  })

  it('is not fooled by a leading or trailing slash mismatch', () => {
    const files = [
      { mtimeMs: 1, path: 'uploads/images/no-leading-slash.png', size: 10 },
      { mtimeMs: 1, path: '/uploads/images/trailing-slash.png/', size: 10 },
    ]
    const referencedPaths = new Set([
      '/uploads/images/no-leading-slash.png',
      'uploads/images/trailing-slash.png',
    ])

    expect(findOrphanedFiles({ files, referencedPaths })).toEqual([])
  })

  it('is not fooled by URL-encoding on either side of the comparison', () => {
    // A Chinese filename, as it would actually be written by multer and then
    // read back out of a database column that may or may not have encoded it.
    const files = [{ mtimeMs: 1, path: '/uploads/images/%E5%9B%BE%E7%89%87.png', size: 10 }]
    const referencedPaths = new Set(['/uploads/images/图片.png'])

    expect(findOrphanedFiles({ files, referencedPaths })).toEqual([])
  })

  it('does not crash on an empty file list or an empty reference set', () => {
    expect(findOrphanedFiles({ files: [], referencedPaths: new Set(['/uploads/images/x.png']) })).toEqual(
      [],
    )
    expect(
      findOrphanedFiles({ files: [{ mtimeMs: 1, path: '/uploads/images/x.png', size: 1 }], referencedPaths: new Set() }),
    ).toHaveLength(1)
    expect(findOrphanedFiles({ files: [], referencedPaths: new Set() })).toEqual([])
    expect(findOrphanedFiles({})).toEqual([])
  })

  // The real reference set is built from five different columns plus a
  // slug-derived path for source archives. A bug that fails to extract one of
  // them must not make every file that column alone protects look orphaned --
  // it only has to be named by ANY one source.
  it('is not orphaned if only one of several reference sources names it', () => {
    const files = [{ mtimeMs: 1, path: '/uploads/models/shared.glb', size: 10 }]
    const fromCommunityPosts = new Set()
    const fromCommunityUploads = new Set(['/uploads/models/shared.glb'])
    const fromVisitorProfiles = new Set()
    const referencedPaths = new Set([
      ...fromCommunityPosts,
      ...fromCommunityUploads,
      ...fromVisitorProfiles,
    ])

    expect(findOrphanedFiles({ files, referencedPaths })).toEqual([])
  })

  it('preserves the size and mtime it was given, for the report to sort and print', () => {
    const files = [{ mtimeMs: 12345, path: '/uploads/avatars/old.jpg', size: 987 }]

    expect(findOrphanedFiles({ files, referencedPaths: new Set() })).toEqual([
      { mtimeMs: 12345, path: '/uploads/avatars/old.jpg', size: 987 },
    ])
  })
})

describe('normalizeUploadPath', () => {
  it('is case-sensitive, because the filesystem it describes is', () => {
    expect(normalizeUploadPath('/uploads/images/Foo.png')).not.toBe(
      normalizeUploadPath('/uploads/images/foo.png'),
    )
  })

  it('strips a query string or fragment, which a stored URL should never carry but a hand-edited row might', () => {
    expect(normalizeUploadPath('/uploads/images/foo.png?v=2')).toBe('/uploads/images/foo.png')
    expect(normalizeUploadPath('/uploads/images/foo.png#preview')).toBe('/uploads/images/foo.png')
  })

  it('returns null rather than throw on a non-string or empty value', () => {
    expect(normalizeUploadPath(null)).toBeNull()
    expect(normalizeUploadPath(undefined)).toBeNull()
    expect(normalizeUploadPath('')).toBeNull()
    expect(normalizeUploadPath('   ')).toBeNull()
  })

  it('does not throw on a malformed percent-encoding, it just compares the raw text', () => {
    expect(normalizeUploadPath('/uploads/images/100%.png')).toBe('/uploads/images/100%.png')
  })
})
