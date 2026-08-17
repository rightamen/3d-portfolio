import { mergeProject, toCustomProject, toProjectOverride } from './mappers.js'

// The catalogue. Base projects come from the bundled content file; this store
// only holds the overrides and the fully custom entries, and merges them.

export const createProjectStore = ({ pool }) => {
  const projectStore = {
    listProjects: async (baseProjects, { includeHidden = false } = {}) => {
      const result = await pool.query(`
        SELECT slug, title, title_zh, title_en, title_ja, summary, summary_zh, summary_en,
          summary_ja, workflow, workflow_zh, workflow_en, workflow_ja, year, image, model_url,
          format, format_zh, format_en, format_ja, model_size, model_size_zh, model_size_en,
          model_size_ja, asset_category, download_policy, download_policy_zh, download_policy_en,
          download_policy_ja, stack, viewer_features, is_public
        FROM project_overrides
      `)
      const customResult = await pool.query(`
        SELECT slug, title, title_zh, title_en, title_ja, summary, summary_zh, summary_en,
          summary_ja, workflow, workflow_zh, workflow_en, workflow_ja, year, image, model_url,
          format, format_zh, format_en, format_ja, model_size, model_size_zh, model_size_en,
          model_size_ja, asset_category, download_policy, download_policy_zh, download_policy_en,
          download_policy_ja, stack, viewer_features, is_public
        FROM custom_projects
        ORDER BY created_at DESC
      `)
      const deletedResult = await pool.query('SELECT slug FROM deleted_projects')
      const deletedSlugs = new Set(deletedResult.rows.map((row) => row.slug))
      const overrides = new Map(
        result.rows.map((row) => [row.slug, toProjectOverride(row)]),
      )
      const customProjects = customResult.rows.map(toCustomProject)

      return [
        ...customProjects,
        ...baseProjects.map((project) => mergeProject(project, overrides.get(project.slug))),
      ]
        .filter((project) => !deletedSlugs.has(project.slug))
        .filter((project) => includeHidden || project.isPublic !== false)
    },

    getProject: async (baseProjects, slug, { includeHidden = false } = {}) => {
      const projects = await projectStore.listProjects(baseProjects, { includeHidden })
      return projects.find((project) => project.slug === slug) || null
    },
  }

  return projectStore
}
