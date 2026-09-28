#!/usr/bin/env node

import { access, cp, mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url))
const showroomRoot = path.resolve(scriptDirectory, '..')
const repositoryRoot = path.resolve(showroomRoot, '..')
const antora = path.join(showroomRoot, 'node_modules', '.bin', 'antora')

async function exists(target) {
  try {
    await access(target)
    return true
  } catch {
    return false
  }
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: 'inherit' })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status ?? 1)
}

if (await exists(path.join(repositoryRoot, '.git'))) {
  run(antora, ['site.yml'], repositoryRoot)
  process.exit(0)
}

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), 'agentic-scale-501-showroom-'))
try {
  await cp(path.join(repositoryRoot, 'site.yml'), path.join(temporaryRoot, 'site.yml'))
  await cp(showroomRoot, path.join(temporaryRoot, 'showroom'), {
    recursive: true,
    filter: (source) => !source.split(path.sep).includes('node_modules'),
  })

  run('git', ['init', '--quiet'], temporaryRoot)
  run('git', ['config', 'user.name', 'Showroom Build'], temporaryRoot)
  run('git', ['config', 'user.email', 'showroom-build@invalid'], temporaryRoot)
  run('git', ['add', 'site.yml', 'showroom'], temporaryRoot)
  run('git', ['commit', '--quiet', '-m', 'Temporary Showroom build snapshot'], temporaryRoot)
  run(antora, ['site.yml'], temporaryRoot)

  const generatedSite = path.join(temporaryRoot, 'www', 'showroom')
  const destination = path.join(repositoryRoot, 'www', 'showroom')
  await rm(destination, { recursive: true, force: true })
  await cp(generatedSite, destination, { recursive: true })
  console.log(`Generated Showroom site at ${destination}`)
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
