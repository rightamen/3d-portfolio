export const documentSlots = [
  ['resume', 'accountDocumentsResume'],
  ['portfolio', 'accountDocumentsPortfolio'],
]

export const formatDocumentSize = (size, language) => {
  const format = new Intl.NumberFormat(language === 'zh' ? 'zh-CN' : language, { maximumFractionDigits: 1 })
  if (size < 1024) return `${format.format(size)} B`
  if (size < 1024 * 1024) return `${format.format(size / 1024)} KB`
  return `${format.format(size / (1024 * 1024))} MB`
}
