#!/usr/bin/env node

import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const showroomRoot = path.resolve(scriptDirectory, '..')
const repositoryRoot = path.resolve(showroomRoot, '..')
const moduleRoot = path.join(showroomRoot, 'modules', 'ROOT')
const pagesRoot = path.join(moduleRoot, 'pages')
const attachmentsRoot = path.join(moduleRoot, 'attachments')

const stages = [
  '00-preflight',
  '01-declare',
  '02-baseline',
  '03-sustain',
  '04-controlled-pressure',
  '05-recovery',
  '06-score-review',
  '07-close-handoff',
]

function fail(message) {
  throw new Error(message)
}

async function text(file) {
  return readFile(file, 'utf8')
}

const nav = await text(path.join(moduleRoot, 'nav.adoc'))
let previousIndex = -1
for (const stage of stages) {
  const entry = `xref:${stage}.adoc[` 
  const index = nav.indexOf(entry)
  if (index < 0) fail(`Navigation is missing ${stage}.adoc`)
  if (index <= previousIndex) fail(`Navigation order is incorrect at ${stage}.adoc`)
  previousIndex = index
}

const pageNames = (await readdir(pagesRoot)).filter((name) => name.endsWith('.adoc')).sort()
const expectedPages = ['index.adoc', ...stages.map((stage) => `${stage}.adoc`)].sort()
if (JSON.stringify(pageNames) !== JSON.stringify(expectedPages)) {
  fail(`Unexpected page inventory: ${pageNames.join(', ')}`)
}

const allPages = new Map()
for (const pageName of pageNames) {
  const pageText = await text(path.join(pagesRoot, pageName))
  allPages.set(pageName, pageText)
  if (!pageText.startsWith('=')) fail(`${pageName} has no AsciiDoc document title`)
  if (pageName !== 'index.adoc') {
    if (!pageText.includes('== Objective')) fail(`${pageName} is missing its objective`)
    if (!pageText.includes('== Learner checkpoint')) fail(`${pageName} is missing its learner checkpoint`)
    if (!pageText.includes('*Pass when:*')) fail(`${pageName} is missing its completion criterion`)
  }
}

const requiredHonesty = [
  ['index.adoc', 'REHEARSAL'],
  ['index.adoc', 'cannot conclude that the workload is live-certified'],
  ['04-controlled-pressure.adoc', 'GATED FUTURE LIVE EXECUTION — DO NOT RUN'],
  ['06-score-review.adoc', 'human disposition and promotion'],
  ['07-close-handoff.adoc', 'automated promotion is false'],
  ['07-close-handoff.adoc', 'No target environment or Launchpad state was changed'],
]
for (const [pageName, phrase] of requiredHonesty) {
  if (!allPages.get(pageName)?.includes(phrase)) fail(`${pageName} is missing required boundary text: ${phrase}`)
}

const sourceCopies = [
  ['content-501/fixtures/baseline.rehearsal.json', 'fixtures/baseline.rehearsal.json'],
  ['content-501/fixtures/sustained.rehearsal.json', 'fixtures/sustained.rehearsal.json'],
  ['content-501/fixtures/pressure.rehearsal.json', 'fixtures/pressure.rehearsal.json'],
  ['content-501/fixtures/recovery.rehearsal.json', 'fixtures/recovery.rehearsal.json'],
  ['content-501/templates/learner-record.md', 'templates/learner-record.md'],
  ['content-501/templates/profile-declaration.yaml', 'templates/profile-declaration.yaml'],
  ['content-501/templates/scorecard.md', 'templates/scorecard.md'],
]
for (const [sourceRelative, attachmentRelative] of sourceCopies) {
  const source = await readFile(path.join(repositoryRoot, sourceRelative))
  const attachment = await readFile(path.join(attachmentsRoot, attachmentRelative))
  if (!source.equals(attachment)) fail(`${attachmentRelative} differs from ${sourceRelative}`)
}

for (const [pageName, pageText] of allPages) {
  for (const match of pageText.matchAll(/xref:([^\[]+)\[/g)) {
    const target = match[1]
    if (target.includes(':') || target.startsWith('http')) continue
    const targetPath = path.resolve(pagesRoot, target)
    try {
      await readFile(targetPath)
    } catch {
      fail(`${pageName} has a broken xref to ${target}`)
    }
  }
  for (const match of pageText.matchAll(/link:\{attachmentsdir\}\/([^\[]+)\[/g)) {
    const target = match[1]
    try {
      await readFile(path.join(attachmentsRoot, target))
    } catch {
      fail(`${pageName} has a broken attachment link to ${target}`)
    }
  }
}

const descriptor = await text(path.join(showroomRoot, 'antora.yml'))
if (!descriptor.includes('modules/ROOT/nav.adoc')) fail('antora.yml does not register the navigation file')
if (!descriptor.includes('page-pagination: true')) fail('Showroom page pagination is not enabled')

const playbook = await text(path.join(repositoryRoot, 'site.yml'))
if (!playbook.includes('start_path: showroom')) fail('site.yml does not point to the Showroom component')
if (!playbook.includes('rhdp_showroom_theme')) fail('site.yml does not use the RHDP Showroom UI bundle')
if (!playbook.includes('supplemental_files: ./showroom/supplemental-ui')) fail('site.yml does not register the supplemental Showroom assets')

console.log(`Showroom content valid — ${stages.length} ordered stages, ${sourceCopies.length} source-exact attachments, links resolved.`)
