export const EVALUATION_SET_SCHEMA_VERSION = 'agentic-501-evaluation-set/v1' as const
export const QUALITY_OBSERVATION_SCHEMA_VERSION = 'agentic-501-quality-observation/v1' as const

type JsonObject = Record<string, unknown>
type Scalar = string | number | boolean | null

interface CaseBase {
  id: string
  sequence: number
  class: 'exact-value' | 'classification' | 'retrieval'
}

export interface ExactValueCase extends CaseBase {
  class: 'exact-value'
  comparison: 'strict' | 'normalized-text'
  expected: Scalar
}

export interface ClassificationCase extends CaseBase {
  class: 'classification'
  labels: string[]
  expectedLabel: string
}

export interface RetrievalCase extends CaseBase {
  class: 'retrieval'
  expectedItems: string[]
}

export type EvaluationCase = ExactValueCase | ClassificationCase | RetrievalCase

export interface EvaluationSetV1 {
  schemaVersion: typeof EVALUATION_SET_SCHEMA_VERSION
  id: string
  version: string
  scorerVersion: string
  aggregation: 'arithmetic-mean'
  cases: EvaluationCase[]
}

export interface QualityObservationV1 {
  schemaVersion: typeof QUALITY_OBSERVATION_SCHEMA_VERSION
  evaluationSetVersion: string
  caseId: string
  class: EvaluationCase['class']
  value: Scalar | string[]
}

export interface CaseScore {
  caseId: string
  sequence: number
  class: EvaluationCase['class']
  score: number
  precision?: number
  recall?: number
}

export interface ClassificationMetric {
  label: string
  truePositive: number
  falsePositive: number
  falseNegative: number
  precision: number
  recall: number
}

export interface EvaluationReport {
  schemaVersion: 'agentic-501-quality-report/v1'
  evaluationSetId: string
  evaluationSetVersion: string
  scorerVersion: string
  evaluatedCases: number
  score: number
  cases: CaseScore[]
  classification?: {
    macroPrecision: number
    macroRecall: number
    labels: ClassificationMetric[]
  }
}

export class QualityEvaluationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'QualityEvaluationError'
  }
}

const object = (value: unknown): value is JsonObject => typeof value === 'object' && value !== null && !Array.isArray(value)
const scalar = (value: unknown): value is Scalar => value === null
  || typeof value === 'string'
  || typeof value === 'boolean'
  || (typeof value === 'number' && Number.isFinite(value))
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0 && value.length <= 256
const exactKeys = (value: JsonObject, required: string[]) => {
  const keys = Object.keys(value).sort()
  return keys.length === required.length && keys.every((key, index) => key === [...required].sort()[index])
}
const uniqueTextArray = (value: unknown, minimum = 1): value is string[] => Array.isArray(value)
  && value.length >= minimum
  && value.every(text)
  && new Set(value).size === value.length

const invalid = (message: string): never => { throw new QualityEvaluationError(message) }

export function parseEvaluationSet(input: unknown): EvaluationSetV1 {
  if (!object(input) || !exactKeys(input, ['schemaVersion', 'id', 'version', 'scorerVersion', 'aggregation', 'cases'])) {
    return invalid('Evaluation set must contain exactly the v1 contract fields')
  }
  if (input.schemaVersion !== EVALUATION_SET_SCHEMA_VERSION) return invalid('Unknown evaluation-set schema version')
  if (!text(input.id) || !text(input.version) || !text(input.scorerVersion)) return invalid('Evaluation set identity is incomplete')
  if (input.aggregation !== 'arithmetic-mean') return invalid('Unknown evaluation-set aggregation')
  if (!Array.isArray(input.cases) || input.cases.length === 0) return invalid('Evaluation set must contain at least one case')

  const ids = new Set<string>()
  const sequences = new Set<number>()
  const cases: EvaluationCase[] = input.cases.map((candidate, index) => {
    if (!object(candidate) || !text(candidate.id) || !Number.isInteger(candidate.sequence) || (candidate.sequence as number) < 1) {
      return invalid(`Evaluation case ${index + 1} has an invalid identity or sequence`)
    }
    if (ids.has(candidate.id)) return invalid(`Duplicate evaluation case id: ${candidate.id}`)
    if (sequences.has(candidate.sequence as number)) return invalid(`Duplicate evaluation case sequence: ${candidate.sequence}`)
    ids.add(candidate.id)
    sequences.add(candidate.sequence as number)

    if (candidate.class === 'exact-value') {
      if (!exactKeys(candidate, ['id', 'sequence', 'class', 'comparison', 'expected'])
        || !['strict', 'normalized-text'].includes(String(candidate.comparison)) || !scalar(candidate.expected)
        || (candidate.comparison === 'normalized-text' && typeof candidate.expected !== 'string')) {
        return invalid(`Exact-value case ${candidate.id} is invalid`)
      }
      return candidate as unknown as ExactValueCase
    }
    if (candidate.class === 'classification') {
      if (!exactKeys(candidate, ['id', 'sequence', 'class', 'labels', 'expectedLabel'])
        || !uniqueTextArray(candidate.labels, 2) || !text(candidate.expectedLabel)
        || !candidate.labels.includes(candidate.expectedLabel)) {
        return invalid(`Classification case ${candidate.id} is invalid`)
      }
      return candidate as unknown as ClassificationCase
    }
    if (candidate.class === 'retrieval') {
      if (!exactKeys(candidate, ['id', 'sequence', 'class', 'expectedItems']) || !uniqueTextArray(candidate.expectedItems)) {
        return invalid(`Retrieval case ${candidate.id} is invalid`)
      }
      return candidate as unknown as RetrievalCase
    }
    return invalid(`Unknown evaluation case class for ${candidate.id}`)
  })

  return { ...input, cases } as unknown as EvaluationSetV1
}

export function parseQualityObservation(input: unknown): QualityObservationV1 {
  if (!object(input) || !exactKeys(input, ['schemaVersion', 'evaluationSetVersion', 'caseId', 'class', 'value'])) {
    return invalid('Quality observation must contain exactly the v1 contract fields')
  }
  if (input.schemaVersion !== QUALITY_OBSERVATION_SCHEMA_VERSION) return invalid('Unknown quality-observation schema version')
  if (!text(input.evaluationSetVersion) || !text(input.caseId)) return invalid('Quality observation identity is incomplete')
  if (!['exact-value', 'classification', 'retrieval'].includes(String(input.class))) return invalid('Unknown quality-observation class')
  if (!scalar(input.value) && !uniqueTextArray(input.value, 0)) return invalid('Quality observation value is invalid')
  return input as unknown as QualityObservationV1
}

const normalizedText = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US')

function scoreCase(expected: EvaluationCase, observation: QualityObservationV1): CaseScore {
  if (observation.caseId !== expected.id || observation.class !== expected.class) {
    return invalid(`Quality observation does not match case ${expected.id}`)
  }
  if (expected.class === 'exact-value') {
    if (Array.isArray(observation.value)) return invalid(`Exact-value case ${expected.id} requires a scalar value`)
    const matches = expected.comparison === 'normalized-text'
      ? typeof observation.value === 'string' && normalizedText(observation.value) === normalizedText(expected.expected as string)
      : Object.is(observation.value, expected.expected)
    return { caseId: expected.id, sequence: expected.sequence, class: expected.class, score: matches ? 1 : 0 }
  }
  if (expected.class === 'classification') {
    if (typeof observation.value !== 'string' || !expected.labels.includes(observation.value)) {
      return invalid(`Classification case ${expected.id} has a value outside its declared labels`)
    }
    return { caseId: expected.id, sequence: expected.sequence, class: expected.class, score: observation.value === expected.expectedLabel ? 1 : 0 }
  }
  if (!Array.isArray(observation.value)) return invalid(`Retrieval case ${expected.id} requires an item array`)
  if (new Set(observation.value).size !== observation.value.length) return invalid(`Retrieval case ${expected.id} contains duplicate items`)
  const expectedItems = new Set(expected.expectedItems)
  const predictedItems = new Set(observation.value)
  const truePositive = [...predictedItems].filter((item) => expectedItems.has(item)).length
  const precision = predictedItems.size === 0 ? 0 : truePositive / predictedItems.size
  const recall = truePositive / expectedItems.size
  const score = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)
  return { caseId: expected.id, sequence: expected.sequence, class: expected.class, score, precision, recall }
}

function classificationMetrics(cases: ClassificationCase[], observations: Map<string, QualityObservationV1>) {
  if (cases.length === 0) return undefined
  const labels = [...new Set(cases.flatMap((item) => item.labels))].sort()
  const metrics = labels.map((label): ClassificationMetric => {
    let truePositive = 0
    let falsePositive = 0
    let falseNegative = 0
    for (const item of cases) {
      const predicted = observations.get(item.id)?.value
      if (predicted === label && item.expectedLabel === label) truePositive += 1
      else if (predicted === label) falsePositive += 1
      else if (item.expectedLabel === label) falseNegative += 1
    }
    return {
      label, truePositive, falsePositive, falseNegative,
      precision: truePositive + falsePositive === 0 ? 0 : truePositive / (truePositive + falsePositive),
      recall: truePositive + falseNegative === 0 ? 0 : truePositive / (truePositive + falseNegative),
    }
  })
  return {
    macroPrecision: metrics.reduce((sum, item) => sum + item.precision, 0) / metrics.length,
    macroRecall: metrics.reduce((sum, item) => sum + item.recall, 0) / metrics.length,
    labels: metrics,
  }
}

export function evaluateQualitySet(setInput: unknown, observationInputs: unknown[]): EvaluationReport {
  const set = parseEvaluationSet(setInput)
  if (!Array.isArray(observationInputs)) return invalid('Quality observations must be an array')
  const observations = new Map<string, QualityObservationV1>()
  for (const input of observationInputs) {
    const observation = parseQualityObservation(input)
    if (observation.evaluationSetVersion !== set.version) return invalid(`Observation ${observation.caseId} uses the wrong evaluation-set version`)
    if (observations.has(observation.caseId)) return invalid(`Duplicate quality observation for case ${observation.caseId}`)
    if (!set.cases.some((item) => item.id === observation.caseId)) return invalid(`Unknown quality observation case: ${observation.caseId}`)
    observations.set(observation.caseId, observation)
  }
  if (observations.size !== set.cases.length) return invalid('Quality evidence is incomplete for the evaluation set')

  const cases = set.cases.map((item) => scoreCase(item, observations.get(item.id)!))
  return {
    schemaVersion: 'agentic-501-quality-report/v1',
    evaluationSetId: set.id,
    evaluationSetVersion: set.version,
    scorerVersion: set.scorerVersion,
    evaluatedCases: cases.length,
    score: cases.reduce((sum, item) => sum + item.score, 0) / cases.length,
    cases,
    classification: classificationMetrics(set.cases.filter((item): item is ClassificationCase => item.class === 'classification'), observations),
  }
}

interface WorkflowQualityInput {
  response: unknown
  sequence: number
  profile: { evaluationSetVersion: string }
}

export function createDeterministicQualityEvaluator(setInput: unknown) {
  const set = parseEvaluationSet(setInput)
  return async ({ response, sequence, profile }: WorkflowQualityInput): Promise<number> => {
    if (profile.evaluationSetVersion !== set.version) return invalid('Run profile uses the wrong evaluation-set version')
    const expected = set.cases.find((item) => item.sequence === sequence)
    if (!expected) return invalid(`No evaluation case exists for sequence ${sequence}`)
    if (!object(response) || !object(response.proof) || !object(response.proof.evidence)
      || response.proof.evidence.status !== 'complete' || !Array.isArray(response.proof.evidence.items)) {
      return invalid(`Quality evidence is missing or incomplete for case ${expected.id}`)
    }
    const candidates = response.proof.evidence.items.filter((item) => object(item)
      && item.schemaVersion === QUALITY_OBSERVATION_SCHEMA_VERSION
      && item.caseId === expected.id)
    if (candidates.length !== 1) return invalid(`Expected exactly one quality observation for case ${expected.id}`)
    const observation = parseQualityObservation(candidates[0])
    if (observation.evaluationSetVersion !== set.version) return invalid(`Observation ${expected.id} uses the wrong evaluation-set version`)
    return scoreCase(expected, observation).score
  }
}
