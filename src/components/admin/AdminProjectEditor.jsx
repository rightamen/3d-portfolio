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
import { useAdminI18n } from '../../lib/admin/i18nAdmin'
import { stagger } from '../../lib/admin/motion'

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
}) => {
  const { language, t } = useAdminI18n()
  const category = getAssetCategoryProfile({ assetCategory: project.assetCategory }, language)

  return (
    <section className="admin-section admin-animate-in" ref={editorRef}>
      <div className="admin-section-header">
        <h2>{project.isNew ? t('editor.newTitle') : t('editor.editTitle')}</h2>
        <span>{project.slug}</span>
      </div>
      <form className="admin-editor" onSubmit={onSubmit}>
        <div className="translation-editor-summary">
          <strong>{t('editor.translationCoverage')}</strong>
          <div className="translation-status-row">
            {getTranslationStates(project).map((item, index) => (
              <span
                className={`translation-status-${item.state} admin-animate-in`}
                key={item.suffix}
                style={stagger(index)}
              >
                {item.suffix.replace('Zh', 'ZH').replace('En', 'EN').replace('Ja', 'JA')}
                <strong>{t(`translation.${item.state}`)}</strong>
              </span>
            ))}
          </div>
        </div>
        <label className="field-label">
          {t('editor.typePreset')}
          <select
            className="field-input field-input-focus"
            defaultValue=""
            onChange={(event) => {
              onApplyPreset(event.target.value)
              event.target.value = ''
            }}
          >
            <option disabled value="">
              {t('editor.applyType')}
            </option>
            {projectPresets.map((preset) => (
              <option key={preset.key} value={preset.key}>
                {t(`preset.${preset.key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          {t('editor.assetCategory')}
          <select
            className="field-input field-input-focus"
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                assetCategory: event.target.value,
              }))
            }
            value={getAssetCategoryProfile(project).value}
          >
            {assetCategoryPresets.map((item) => (
              <option key={item.value} value={item.value}>
                {item.labels?.[language] || item.label}
              </option>
            ))}
          </select>
          <span className="asset-editor-note" style={{ '--category-accent': category.accent }}>
            <strong>{category.label}</strong>
            <span>{category.description}</span>
          </span>
        </label>
        <label className="field-label">
          {t('editor.slug')}
          <input
            className="field-input field-input-focus"
            disabled={!project.isNew}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                slug: event.target.value.toLowerCase(),
              }))
            }
            placeholder="new-project-slug"
            required
            value={project.slug}
          />
        </label>
        <label className="field-label">
          {t('editor.title')}
          <input
            className="field-input field-input-focus"
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                title: event.target.value,
              }))
            }
            required
            value={project.title}
          />
        </label>
        <label className="field-label">
          {t('editor.summary')}
          <textarea
            className="field-input field-input-focus min-h-24 resize-none"
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                summary: event.target.value,
              }))
            }
            required
            value={project.summary}
          />
        </label>
        <label className="field-label">
          {t('editor.workflow')}
          <textarea
            className="field-input field-input-focus min-h-28 resize-none"
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                workflow: event.target.value,
              }))
            }
            value={project.workflow || ''}
          />
        </label>
        <details className="translation-panel">
          <summary>
            <span>
              {t('editor.languageVersions')}
              <small>{t('editor.languageVersionsHint')}</small>
            </span>
          </summary>
          <div className="translation-grid">
            {localizedEditorLanguages.map((editorLanguage, index) => (
              <section
                className="translation-card admin-animate-in"
                key={editorLanguage.suffix}
                style={stagger(index)}
              >
                <div className="translation-card-header">
                  <strong>{editorLanguage.label}</strong>
                  <button
                    className="secondary-action"
                    onClick={() => onCopyBaseCopy(editorLanguage.suffix)}
                    type="button"
                  >
                    {t('editor.copyBase')}
                  </button>
                </div>
                {localizedEditorFields.map((field) => {
                  const fieldName = `${field.key}${editorLanguage.suffix}`
                  const Input = field.multiline ? 'textarea' : 'input'

                  return (
                    <label className="field-label" key={fieldName}>
                      {t(field.labelKey)}
                      <Input
                        className={`field-input field-input-focus ${
                          field.multiline ? 'min-h-24 resize-none' : ''
                        }`}
                        onChange={(event) =>
                          onChange((current) => ({
                            ...current,
                            [fieldName]: event.target.value,
                          }))
                        }
                        value={project[fieldName] || ''}
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
            {t('editor.year')}
            <input
              className="field-input field-input-focus"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  year: event.target.value,
                }))
              }
              required
              value={project.year}
            />
          </label>
          <label className="field-label">
            {t('editor.format')}
            <select
              className="field-input field-input-focus"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  format: event.target.value,
                }))
              }
              value=""
            >
              <option disabled value="">
                {t('editor.chooseFormat')}
              </option>
              {formatPresets.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
            <input
              className="field-input field-input-focus"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  format: event.target.value,
                }))
              }
              value={project.format || ''}
            />
          </label>
          <label className="field-label">
            {t('editor.imageUrl')}
            <input
              className="field-input field-input-focus"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  image: event.target.value,
                }))
              }
              required
              value={project.image}
            />
          </label>
          <label className="field-label">
            {t('editor.uploadImage')}
            <span
              className={`asset-upload-control ${
                uploadStatus.image.phase === 'done' ? 'asset-upload-control-done' : ''
              }`}
            >
              {uploadStatus.image.phase === 'uploading' && t('editor.uploadingImage')}
              {uploadStatus.image.phase === 'done' && uploadStatus.image.message}
              {uploadStatus.image.phase === 'error' && uploadStatus.image.message}
              {uploadStatus.image.phase === 'idle' && t('editor.chooseImage')}
              <input
                accept=".jpg,.jpeg,.png,.webp,.gif"
                onChange={(event) => onSelectAsset(event, 'image')}
                type="file"
              />
            </span>
            {uploadStatus.image.phase !== 'idle' && (
              <span className="asset-upload-progress">
                <span style={{ width: `${uploadStatus.image.progress}%` }} />
              </span>
            )}
          </label>
          <label className="field-label">
            {t('editor.modelUrl')}
            <input
              className="field-input field-input-focus"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  modelUrl: event.target.value,
                }))
              }
              value={project.modelUrl || ''}
            />
          </label>
          <label className="field-label">
            {t('editor.uploadModel')}
            <span
              className={`asset-upload-control ${
                uploadStatus.modelUrl.phase === 'done' ? 'asset-upload-control-done' : ''
              }`}
            >
              {uploadStatus.modelUrl.phase === 'uploading' && t('editor.uploadingModel')}
              {uploadStatus.modelUrl.phase === 'processing' && uploadStatus.modelUrl.message}
              {uploadStatus.modelUrl.phase === 'done' && uploadStatus.modelUrl.message}
              {uploadStatus.modelUrl.phase === 'error' && uploadStatus.modelUrl.message}
              {uploadStatus.modelUrl.phase === 'idle' && t('editor.chooseModel')}
              <input
                accept=".glb,.gltf,.fbx,.obj,.mtl,.jpg,.jpeg,.png,.webp"
                multiple
                onChange={(event) => onSelectAsset(event, 'modelUrl')}
                type="file"
              />
            </span>
            {uploadStatus.modelUrl.phase !== 'idle' && (
              <span className="asset-upload-progress">
                <span style={{ width: `${uploadStatus.modelUrl.progress}%` }} />
              </span>
            )}
            <span className="field-hint">{t('editor.modelHint')}</span>
          </label>
          <label className="field-label">
            {t('editor.modelSize')}
            <select
              className="field-input field-input-focus"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  modelSize: event.target.value,
                }))
              }
              value=""
            >
              <option disabled value="">
                {t('editor.chooseSize')}
              </option>
              {modelSizePresets.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <input
              className="field-input field-input-focus"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  modelSize: event.target.value,
                }))
              }
              value={project.modelSize || ''}
            />
          </label>
          <label className="field-label">
            {t('editor.downloadPolicy')}
            <select
              className="field-input field-input-focus"
              onChange={(event) =>
                onChange((current) => ({
                  ...current,
                  downloadPolicy: event.target.value,
                }))
              }
              value={project.downloadPolicy || ''}
            >
              {downloadPolicyPresets.map((policy) => (
                <option key={policy.value} value={policy.value}>
                  {t(policy.labelKey)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="field-label">
          {t('editor.stack')}
          <select
            className="field-input field-input-focus"
            onChange={(event) => {
              onAddStackKeyword(event.target.value)
              event.target.value = ''
            }}
            value=""
          >
            <option disabled value="">
              {t('editor.addKeyword')}
            </option>
            {stackKeywordPresets.map((keyword) => (
              <option key={keyword} value={keyword}>
                {keyword}
              </option>
            ))}
          </select>
          <input
            className="field-input field-input-focus"
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                stackText: event.target.value,
              }))
            }
            value={project.stackText}
          />
        </label>
        <label className="field-label">
          {t('editor.viewerFeatures')}
          <select
            className="field-input field-input-focus"
            onChange={(event) => {
              onAddViewerFeature(event.target.value)
              event.target.value = ''
            }}
            value=""
          >
            <option disabled value="">
              {t('editor.addFeature')}
            </option>
            {viewerFeaturePresets.map((feature) => (
              <option key={feature} value={feature}>
                {feature}
              </option>
            ))}
          </select>
          <input
            className="field-input field-input-focus"
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                viewerFeaturesText: event.target.value,
              }))
            }
            value={project.viewerFeaturesText}
          />
        </label>
        <label className="admin-toggle">
          <input
            checked={project.isPublic !== false}
            onChange={(event) =>
              onChange((current) => ({
                ...current,
                isPublic: event.target.checked,
              }))
            }
            type="checkbox"
          />
          {t('editor.publicProject')}
        </label>
        <div className="flex flex-wrap gap-3">
          <button className="primary-action" disabled={status === 'saving'} type="submit">
            {status === 'saving' ? t('editor.saving') : t('editor.save')}
          </button>
          <button className="secondary-action" onClick={() => onCancel()} type="button">
            {t('common.cancel')}
          </button>
        </div>
        {status === 'error' && <p className="text-sm text-coral">{t('editor.saveError')}</p>}
      </form>
    </section>
  )
}

export default AdminProjectEditor
