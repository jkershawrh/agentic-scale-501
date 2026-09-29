import { execFileSync } from 'node:child_process'

const rendered = execFileSync(
  'helm',
  ['template', 'blueprint', 'charts/agentic-scale-501'],
  { encoding: 'utf8' },
)

for (const name of ['blueprint-presentation', 'blueprint-qualifier']) {
  const routePattern = new RegExp(
    `kind: Route[\\s\\S]*?name: ${name}[\\s\\S]*?insecureEdgeTerminationPolicy: Redirect`,
  )
  if (!routePattern.test(rendered)) {
    throw new Error(`Rendered chart is missing the edge-terminated ${name} Route`)
  }
}

console.log('Helm route contract verified for presentation and qualifier.')
