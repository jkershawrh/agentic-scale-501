import { execFileSync } from 'node:child_process'

const rendered = execFileSync(
  'helm',
  ['template', 'blueprint', 'charts/agentic-scale-501'],
  { encoding: 'utf8' },
)

for (const [name, hostPrefix] of [
  ['blueprint-presentation', 'a501p-'],
  ['blueprint-qualifier', 'a501q-'],
]) {
  const routePattern = new RegExp(
    `kind: Route[\\s\\S]*?name: ${name}[\\s\\S]*?insecureEdgeTerminationPolicy: Redirect`,
  )
  if (!routePattern.test(rendered)) {
    throw new Error(`Rendered chart is missing the edge-terminated ${name} Route`)
  }
  if (!rendered.includes(`host: ${hostPrefix}default.apps.flightpath.fm2aihpcsed.com`)) {
    throw new Error(`Rendered ${name} Route does not use its bounded Flightpath hostname`)
  }
}

console.log('Helm route contract verified for presentation and qualifier.')
