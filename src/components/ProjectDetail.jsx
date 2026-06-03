import { lazy, Suspense, useEffect, useState } from 'react'
import { getProject } from '../lib/api'

const ModelPreview = lazy(() => import('./ModelPreview'))

const ProjectDetail = ({ slug, onClose }) => {
  const [project, setProject] = useState(null)
  const [status, setStatus] = useState('loading')
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)

  useEffect(() => {
    let isMounted = true

    getProject(slug)
      .then((payload) => {
        if (!isMounted) return
        setProject(payload.project)
        setStatus('ready')
      })
      .catch(() => {
        if (isMounted) setStatus('error')
      })

    return () => {
      isMounted = false
    }
  }, [slug])

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  return (
    <div className="detail-overlay" role="dialog" aria-modal="true">
      <article className="detail-panel">
        <div className="detail-header">
          <div>
            <div className="section-kicker mb-1">Project Detail</div>
            <h3 className="text-2xl font-semibold text-white">
              {project?.title || 'Loading project'}
            </h3>
          </div>
          <button type="button" className="secondary-action" onClick={onClose}>
            Close
          </button>
        </div>

        {status === 'loading' && (
          <div className="p-6 text-neutral-400">Loading project details...</div>
        )}

        {status === 'error' && (
          <div className="p-6 text-coral">Could not load this project.</div>
        )}

        {project && (
          <div className="detail-body">
            <div className="detail-media">
              <img src={project.image} alt="" className="h-full w-full object-cover" />
            </div>

            <div className="detail-content">
              <p className="leading-relaxed text-neutral-300">{project.summary}</p>

              <div className="detail-stat-grid">
                <div className="detail-stat">
                  <span>Year</span>
                  <strong>{project.year}</strong>
                </div>
                <div className="detail-stat">
                  <span>Format</span>
                  <strong>{project.format || 'Web preview'}</strong>
                </div>
                <div className="detail-stat">
                  <span>Model Size</span>
                  <strong>{project.modelSize || 'Preview asset'}</strong>
                </div>
                <div className="detail-stat">
                  <span>Download</span>
                  <strong>{project.downloadPolicy || 'By request'}</strong>
                </div>
              </div>

              <section>
                <h4 className="detail-subtitle">Workflow</h4>
                <p className="leading-relaxed text-neutral-400">
                  {project.workflow ||
                    'Production asset prepared for realtime browser presentation.'}
                </p>
              </section>

              <section>
                <h4 className="detail-subtitle">Viewer Features</h4>
                <div className="flex flex-wrap gap-2">
                  {(project.viewerFeatures || []).map((feature) => (
                    <span key={feature} className="skill-pill">
                      {feature}
                    </span>
                  ))}
                </div>
              </section>

              <section>
                <h4 className="detail-subtitle">Stack</h4>
                <div className="flex flex-wrap gap-2">
                  {project.stack.map((tag) => (
                    <span key={tag} className="skill-pill">
                      {tag}
                    </span>
                  ))}
                </div>
              </section>

              <div className="flex flex-col gap-3 sm:flex-row">
                {project.modelUrl && (
                  <button
                    type="button"
                    className="primary-action flex-1"
                    onClick={() => setIsPreviewOpen(true)}
                  >
                    Open 3D Viewer
                  </button>
                )}
                <button type="button" className="secondary-action flex-1" disabled>
                  Request Download
                </button>
              </div>
            </div>
          </div>
        )}
      </article>

      {project && isPreviewOpen && (
        <Suspense fallback={null}>
          <ModelPreview project={project} onClose={() => setIsPreviewOpen(false)} />
        </Suspense>
      )}
    </div>
  )
}

export default ProjectDetail
