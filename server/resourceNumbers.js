const maxBigint = 9223372036854775807n

export const parseResourceNumber = (value) => {
  const match = String(value ?? '').trim().normalize('NFKC').match(/^#?0*([1-9][0-9]{0,18})$/)
  if (!match || BigInt(match[1]) > maxBigint) return null
  return match[1]
}

export const formatResourceNumber = (value) => value == null ? null : String(value).padStart(5, '0')
