import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

export type ParsedHeading = { heading: string; content: string }

function headingsFromText(text: string): ParsedHeading[] {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
  const headings: ParsedHeading[] = []
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const isHeading = line.length <= 80 && (line === line.toUpperCase() || /^(education|experience|projects|skills|certifications?|achievements?|summary|profile)$/i.test(line))
    if (isHeading) headings.push({ heading: line, content: lines[index + 1] ?? '' })
  }
  return headings.slice(0, 30)
}

export async function parseResume(buffer: Buffer, mimeType: string): Promise<ParsedHeading[]> {
  if (mimeType === 'application/pdf') {
    const parser = new PDFParse({ data: buffer })
    try {
      const parsed = await parser.getText()
      return headingsFromText(parsed.text)
    } finally {
      await parser.destroy()
    }
  }
  const parsed = await mammoth.convertToHtml({ buffer })
  const headings = [...parsed.value.matchAll(/<h[1-2][^>]*>(.*?)<\/h[1-2]>/gi)].map((match) => ({ heading: match[1].replace(/<[^>]+>/g, '').trim(), content: '' }))
  return headings.length ? headings.slice(0, 30) : headingsFromText((await mammoth.extractRawText({ buffer })).value)
}
