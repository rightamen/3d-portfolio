const CreatorNumber = ({ copy, number }) => number && (
  <small className="creator-number">{copy.creatorNumberLabel} {number}</small>
)

export default CreatorNumber
