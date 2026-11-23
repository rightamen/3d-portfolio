const ResourceNumber = ({ copy, number }) => number && (
  <small className="resource-number">{copy.resourceNumberLabel} #{number}</small>
)

export default ResourceNumber
