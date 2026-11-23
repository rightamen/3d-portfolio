export const isCreatorNumberQuery = (value) => /^[0-9]{6,}$/.test(value)

export const formatCreatorNumber = (value) => value == null ? null : String(value).padStart(6, '0')
