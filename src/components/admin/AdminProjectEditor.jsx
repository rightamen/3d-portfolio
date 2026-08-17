import { getAssetCategoryProfile } from '../../lib/assetCategories'
import {
  assetCategoryPresets,
  downloadPolicyPresets,
  formatPresets,
  getTranslationStates,
  localizedEditorFields,
  localizedEditorLanguages,
  modelSizePresets,
  projectPresets,
  stackKeywordPresets,
  viewerFeaturePresets,
} from '../../lib/admin/projectEditor'

// The whole project form: the base copy, the per-language grid, the two
// uploaders, and the preset dropdowns that fill the tedious fields in. It owns
// no state -- `project` is the parent's editing draft and every keystroke goes
// back up through `onChange`.
const AdminProjectEditor = ({
  editorRef,
  onAddStackKeyword,
  onAddViewerFeature,
  onApplyPreset,
  onCancel,
  onChange,
  onCopyBaseCopy,
  onSelectAsset,
  onSubmit,
  project,
  status,
  uploadStatus,
}) => (
  <section className="admin-section" ref={editorRef}>
    <div className="admin-section-header">
      <h2>{project.isNew ? 'New Project' : 'Edit Project'}</h2>
      <span>{project.slug}</span>
    </div>
    <form className="admin-editor" onSubmit={onSubmit}>
      <div className="translation-editor-summary">
        <strong>Translation Coverage</strong>
        <div className="translation-status-row">
          {getTranslationStates(project).map((item) => (
            <span key={item.suffix} className={`translation-status-${item.state}`}>
              {item.suffix.replace('Zh', 'ZH').replace('En', 'EN').replace('Ja', 'JA')}
              <strong>{item.state}</strong>
            </span>
          ))}
        </div>
      </div>
      <label className="field-label">
        Project Type Preset
        <select
          className="field-input field-input-focus"
          defaultValue=""
          onChange={(event) => {
            onApplyPreset(event.target.value)
            event.target.value = ''
          }}
        >
          <option value="" disabled>
            Apply a project type...
          </option>
          {projectPresets.map((preset) => (
            <option key={preset.key} value={preset.key}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <label className="field-label">
        Asset Category
        <select
          className="field-input field-input-focus"
          value={getAssetCategoryProfile(project).value}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              assetCategory: event.target.value,
            }))
          }
        >
          {assetCategoryPresets.map((category) => (
            <option key={category.value} value={category.value}>
              {category.label}
            </option>
          ))}
        </select>
        <span
          className="asset-editor-note"
          style={{
            '--category-accent': getAssetCategoryProfile({
              assetCategory: project.assetCategory,
            }).accent,
          }}
        >
          <strong>
            {
              getAssetCategoryProfile({
                assetCategory: project.assetCategory,
              }).label
            }
          </strong>
          <span>
            {
              getAssetCategoryProfile({
                assetCategory: project.assetCategory,
              }).description
            }
          </span>
        </span>
      </label>
      <label className="field-label">
        Slug
        <input
          className="field-input field-input-focus"
          value={project.slug}
          disabled={!project.isNew}
          placeholder="new-project-slug"
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              slug: event.target.value.toLowerCase(),
            }))
          }
          required
        />
      </label>
      <label className="field-label">
        Title
        <input
          className="field-input field-input-focus"
          value={project.title}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              title: event.target.value,
            }))
          }
          required
        />
      </label>
      <label className="field-label">
        Summary
        <textarea
          className="field-input field-input-focus min-h-24 resize-none"
          value={project.summary}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              summary: event.target.value,
            }))
          }
          required
        />
      </label>
      <label className="field-label">
        Workflow
        <textarea
          className="field-input field-input-focus min-h-28 resize-none"
          value={project.workflow || ''}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              workflow: event.target.value,
            }))
          }
        />
      </label>
      <details className="translation-panel">
        <summary>
          <span>
            Language Versions
            <small>Optional copy for Chinese, English, and Japanese visitors</small>
          </span>
        </summary>
        <div className="translation-grid">
          {localizedEditorLanguages.map((language) => (
            <section key={language.suffix} className="translation-card">
              <div className="translation-card-header">
                <strong>{language.label}</strong>
                <button
                  type="button"
                  className="secondary-action"
                  onClick={() => onCopyBaseCopy(language.suffix)}
                >
                  Copy Base
                </button>
              </div>
              {localizedEditorFields.map((field) => {
                const fieldName = `${field.key}${language.suffix}`
                const Input = field.multiline ? 'textarea' : 'input'

                return (
                  <label key={fieldName} className="field-label">
                    {field.label}
                    <Input
                      className={`field-input field-input-focus ${
                        field.multiline ? 'min-h-24 resize-none' : ''
                      }`}
                      value={project[fieldName] || ''}
                      onChange={(event) =>
                        onChange((current) => ({
                          ...current,
                          [fieldName]: event.target.value,
                        }))
                      }
                    />
                  </label>
                )
              })}
            </section>
          ))}
        </div>
      </details>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="field-label">
          Year
          <input
            className="field-input field-input-focus"
            value={project.year}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                year: event.target.value,
              }))
            }
            required
          />
        </label>
        <label className="field-label">
          Format
          <select
            className="field-input field-input-focus"
            value=""
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                format: event.target.value,
              }))
            }
          >
            <option value="" disabled>
              Choose a format preset...
            </option>
            {formatPresets.map((format) => (
              <option key={format} value={format}>
                {format}
              </option>
            ))}
          </select>
          <input
            className="field-input field-input-focus"
            value={project.format || ''}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                format: event.target.value,
              }))
            }
          />
        </label>
        <label className="field-label">
          Image URL
          <input
            className="field-input field-input-focus"
            value={project.image}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                image: event.target.value,
              }))
            }
            required
          />
        </label>
        <label className="field-label">
          Upload Image
          <span
            className={`asset-upload-control ${
              uploadStatus.image.phase === 'done' ? 'asset-upload-control-done' : ''
            }`}
          >
            {uploadStatus.image.phase === 'uploading' && 'Uploading image...'}
            {uploadStatus.image.phase === 'done' && uploadStatus.image.message}
            {uploadStatus.image.phase === 'error' && uploadStatus.image.message}
            {uploadStatus.image.phase === 'idle' && 'Choose image file'}
            <input
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.gif"
              onChange={(event) => onSelectAsset(event, 'image')}
            />
          </span>
          {uploadStatus.image.phase !== 'idle' && (
            <span className="asset-upload-progress">
              <span style={{ width: `${uploadStatus.image.progress}%` }} />
            </span>
          )}
        </label>
        <label className="field-label">
          Model URL
          <input
            className="field-input field-input-focus"
            value={project.modelUrl || ''}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                modelUrl: event.target.value,
              }))
            }
          />
        </label>
        <label className="field-label">
          Upload Model
          <span
            className={`asset-upload-control ${
              uploadStatus.modelUrl.phase === 'done' ? 'asset-upload-control-done' : ''
            }`}
          >
            {uploadStatus.modelUrl.phase === 'uploading' && 'Uploading model...'}
            {uploadStatus.modelUrl.phase === 'processing' && uploadStatus.modelUrl.message}
            {uploadStatus.modelUrl.phase === 'done' && uploadStatus.modelUrl.message}
            {uploadStatus.modelUrl.phase === 'error' && uploadStatus.modelUrl.message}
            {uploadStatus.modelUrl.phase === 'idle' && 'Choose model and texture files'}
            <input
              type="file"
              accept=".glb,.gltf,.fbx,.obj,.mtl,.jpg,.jpeg,.png,.webp"
              multiple
              onChange={(event) => onSelectAsset(event, 'modelUrl')}
            />
          </span>
          {uploadStatus.modelUrl.phase !== 'idle' && (
            <span className="asset-upload-progress">
              <span style={{ width: `${uploadStatus.modelUrl.progress}%` }} />
            </span>
          )}
          <span className="field-hint">
            Select OBJ, MTL, and web textures together. PSD/TGA references can use a selected
            PNG/JPG/WebP replacement.
          </span>
        </label>
        <label className="field-label">
          Model Size
          <select
            className="field-input field-input-focus"
            value=""
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                modelSize: event.target.value,
              }))
            }
          >
            <option value="" disabled>
              Choose a size preset...
            </option>
            {modelSizePresets.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
          <input
            className="field-input field-input-focus"
            value={project.modelSize || ''}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                modelSize: event.target.value,
              }))
            }
          />
        </label>
        <label className="field-label">
          Download Policy
          <select
            className="field-input field-input-focus"
            value={project.downloadPolicy || ''}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                downloadPolicy: event.target.value,
              }))
            }
          >
            {downloadPolicyPresets.map((policy) => (
              <option key={policy.value} value={policy.value}>
                {policy.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="field-label">
        Stack
        <select
          className="field-input field-input-focus"
          value=""
          onChange={(event) => {
            onAddStackKeyword(event.target.value)
            event.target.value = ''
          }}
        >
          <option value="" disabled>
            Add a keyword...
          </option>
          {stackKeywordPresets.map((keyword) => (
            <option key={keyword} value={keyword}>
              {keyword}
            </option>
          ))}
        </select>
        <input
          className="field-input field-input-focus"
          value={project.stackText}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              stackText: event.target.value,
            }))
          }
        />
      </label>
      <label className="field-label">
        Viewer Features
        <select
          className="field-input field-input-focus"
          value=""
          onChange={(event) => {
            onAddViewerFeature(event.target.value)
            event.target.value = ''
          }}
        >
          <option value="" disabled>
            Add a viewer feature...
          </option>
          {viewerFeaturePresets.map((feature) => (
            <option key={feature} value={feature}>
              {feature}
            </option>
          ))}
        </select>
        <input
          className="field-input field-input-focus"
          value={project.viewerFeaturesText}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              viewerFeaturesText: event.target.value,
            }))
          }
        />
      </label>
      <label className="admin-toggle">
        <input
          type="checkbox"
          checked={project.isPublic !== false}
          onChange={(event) =>
            onChange((current) => ({
              ...current,
              isPublic: event.target.checked,
            }))
          }
        />
        Public project
      </label>
      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          className="primary-action"
          disabled={status === 'saving'}
        >
          {status === 'saving' ? 'Saving...' : 'Save Project'}
        </button>
        <button
          type="button"
          className="secondary-action"
          onClick={() => onCancel()}
        >
          Cancel
        </button>
      </div>
      {status === 'error' && (
        <p className="text-sm text-coral">Could not save this project.</p>
      )}
    </form>
  </section>
)

export default AdminProjectEditor
