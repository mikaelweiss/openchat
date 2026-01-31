// Helper function to extract citations from text
export function extractCitations(text: string): { text: string; citations: any[] } {
  const citationRegex = /\[(\d+)\]\(([^)]+)\)/g
  const urlToNumberMap = new Map<string, number>()
  let updatedText = text
  let nextCitationNumber = 1

  // First pass: find all unique URLs and assign them a sequential number
  const matches = Array.from(text.matchAll(citationRegex))
  matches.forEach(match => {
    const url = match[2]
    if (!urlToNumberMap.has(url)) {
      urlToNumberMap.set(url, nextCitationNumber++)
    }
  })

  // Second pass: replace all citation numbers with the new sequential numbers
  matches.forEach(match => {
    const oldNumber = match[1]
    const url = match[2]
    const newNumber = urlToNumberMap.get(url)
    const oldCitation = `[${oldNumber}](${url})`
    const newCitation = `[${newNumber}](${url})`
    // Use replace with regex for ES2020 compatibility
    const escapedOldCitation = oldCitation.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    updatedText = updatedText.replace(new RegExp(escapedOldCitation, 'g'), newCitation)
  })

  const finalCitations = Array.from(urlToNumberMap.entries())
    .map(([url, number]) => ({
      number,
      url,
      domain: new URL(url).hostname.replace(/^www\./, ''),
    }))
    .sort((a, b) => a.number - b.number)

  return {
    text: updatedText,
    citations: finalCitations,
  }
}