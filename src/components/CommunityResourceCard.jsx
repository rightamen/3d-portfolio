import { getAssetCategoryProfile } from '../lib/assetCategories'
import { formatResourceFileSize } from '../lib/resources'
import ReportButton from './ReportButton'
import ResourceNumber from './ResourceNumber'

const CommunityResourceCard = ({ authToken, copy, language, upload }) => {
  const category = getAssetCategoryProfile({ assetCategory: upload.assetCategory }, language)
  const fileSize = formatResourceFileSize(upload.fileSize)

  return (
    <article className="community-card" style={{ '--category-accent': category.accent }}>
      {upload.previewUrl ? (
        <img src={upload.previewUrl} alt="" decoding="async" loading="lazy" />
      ) : (
        <div className="community-file-preview">{upload.fileType}</div>
      )}
      <div>
        <span className="project-category-badge">{category.label}</span>
        <h4>{upload.title}</h4>
        <ResourceNumber copy={copy} number={upload.resourceNumber} />
        <p>{upload.description}</p>
        <small>{upload.user?.displayName || copy.accountGuest}{fileSize && ` · ${fileSize}`}</small>
        <a className="secondary-action" href={upload.fileUrl} target="_blank" rel="noreferrer">
          {copy.communityOpenFile}
        </a>
        <ReportButton authToken={authToken} copy={copy} targetType="resource" targetId={upload.id} />
      </div>
    </article>
  )
}

export default CommunityResourceCard
