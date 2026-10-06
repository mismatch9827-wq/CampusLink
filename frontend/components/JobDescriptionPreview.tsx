import React from 'react'

const SECTION_HEADINGS = [
  'ABOUT THE COMPANY',
  'JOB DESCRIPTION',
  'KEY RESPONSIBILITIES',
  'ELIGIBILITY CRITERIA',
  'GOOD TO HAVE',
  'SELECTION PROCESS',
]

const SUMMARY_LABEL = 'company|role|minimum\\s+cgpa|max(?:imum)?\\s+backlogs|ctc(?:\\s*\\([^)]*\\))?|drive\\s+date|time\\s+slot|venue|eligible\\s+branches|required\\s+skills'
const SUMMARY_ROW = /^(?:company|role|minimum\s+cgpa|max(?:imum)?\s+backlogs|ctc(?:\s*\([^)]*\))?|drive\s+date|time\s+slot|venue|eligible\s+branches|required\s+skills)(?:\s*\||\s*:|\s+).*$/i
const BULLET = /[•●▪]/

function prepareSections(source: string) {
  let normalized = source
    .replace(/---\s*PAGE\s+\d+\s*---/gi, '\n')
    .replace(/\(cid:127\)/gi, '\n• ')
    .replace(/\(cid:\d+\)/gi, '')
    .replace(/\u00ad/g, '')
    .replace(/-\s*\n\s*(?=[a-z])/g, '')

  normalized = normalized.replace(new RegExp(`\\s+(?=(?:${SUMMARY_LABEL})\\b)`, 'gi'), '\n')

  for (const heading of SECTION_HEADINGS) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    normalized = normalized.replace(new RegExp(`\\b${escaped}\\b`, 'gi'), `\n${heading}\n`)
  }

  const sections: { title: string; lines: string[] }[] = []
  let current = { title: 'Job description', lines: [] as string[] }
  const headingPattern = new RegExp(`^(?:${SECTION_HEADINGS.join('|')})$`, 'i')

  for (const rawLine of normalized.split(/\r?\n/)) {
    const line = rawLine.replace(/[ \t]+/g, ' ').trim()
    if (!line || /^\[Extracted table\]$/i.test(line) || SUMMARY_ROW.test(line)) continue

    if (headingPattern.test(line.replace(/:$/, '').trim())) {
      if (current.lines.length) sections.push(current)
      current = { title: line.replace(/:$/, '').trim(), lines: [] }
      continue
    }

    current.lines.push(line)
  }

  if (current.lines.length) sections.push(current)
  return sections
}

function renderLine(line: string, key: string) {
  const bullets = line.split(BULLET).map((item) => item.trim()).filter(Boolean)
  if (bullets.length > 1 || BULLET.test(line)) {
    return (
      <ul key={key} className="list-disc space-y-1 pl-5 text-xs leading-5 text-slate-600 marker:text-brand">
        {bullets.map((item, index) => <li key={`${key}-${index}`} className="break-words">{item}</li>)}
      </ul>
    )
  }

  const numbered = line.match(/^\d+[.)]\s+(.+)$/)
  if (numbered) {
    return <p key={key} className="text-xs leading-5 text-slate-600">{line}</p>
  }

  return <p key={key} className="text-xs leading-5 text-slate-600">{line}</p>
}

export function JobDescriptionPreview({ text }: { text: string }) {
  const sections = prepareSections(text)

  if (!sections.length) {
    return <p className="text-xs text-slate-500">No readable job-description text was extracted.</p>
  }

  return (
    <div className="mt-2 max-h-[420px] space-y-4 overflow-y-auto border-t border-slate-100 pt-4">
      {sections.map((section, sectionIndex) => (
        <section key={`${section.title}-${sectionIndex}`}>
          {section.title !== 'Job description' && (
            <h3 className="mb-1.5 text-[10px] font-extrabold uppercase tracking-[.1em] text-navy">
              {section.title}
            </h3>
          )}
          <div className="space-y-2">
            {section.lines.map((line, lineIndex) => renderLine(line, `${sectionIndex}-${lineIndex}`))}
          </div>
        </section>
      ))}
    </div>
  )
}