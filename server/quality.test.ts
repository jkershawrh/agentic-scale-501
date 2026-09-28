import { describe, expect, it } from 'vitest'
import {
  createDeterministicQualityEvaluator,
  evaluateQualitySet,
  parseEvaluationSet,
  QualityEvaluationError,
  type EvaluationSetV1,
} from './quality'
import type { WorkflowJourneyExecutorOptions } from './workflowExecutor'

const set: EvaluationSetV1 = {
  schemaVersion: 'agentic-501-evaluation-set/v1',
  id: 'governed-workflow',
  version: 'eval-v1',
  scorerVersion: 'deterministic-v1',
  aggregation: 'arithmetic-mean',
  cases: [
    { id: 'exact', sequence: 1, class: 'exact-value', comparison: 'normalized-text', expected: 'Human review required' },
    { id: 'allow', sequence: 2, class: 'classification', labels: ['allow', 'deny'], expectedLabel: 'allow' },
    { id: 'deny', sequence: 3, class: 'classification', labels: ['allow', 'deny'], expectedLabel: 'deny' },
    { id: 'sources', sequence: 4, class: 'retrieval', expectedItems: ['policy', 'record'] },
  ],
}

const observation = (caseId: string, caseClass: 'exact-value' | 'classification' | 'retrieval', value: unknown) => ({
  schemaVersion: 'agentic-501-quality-observation/v1', evaluationSetVersion: 'eval-v1', caseId, class: caseClass, value,
})

describe('deterministic Agentic AI 501 quality evaluator', () => {
  it('scores each class and exposes defensible precision and recall', () => {
    const report = evaluateQualitySet(set, [
      observation('exact', 'exact-value', ' human   review REQUIRED '),
      observation('allow', 'classification', 'allow'),
      observation('deny', 'classification', 'allow'),
      observation('sources', 'retrieval', ['policy', 'extra']),
    ])

    expect(report.cases.map((item) => item.score)).toEqual([1, 1, 0, 0.5])
    expect(report.score).toBe(0.625)
    expect(report.cases[3]).toMatchObject({ precision: 0.5, recall: 0.5 })
    expect(report.classification).toEqual({
      macroPrecision: 0.25,
      macroRecall: 0.5,
      labels: [
        { label: 'allow', truePositive: 1, falsePositive: 1, falseNegative: 0, precision: 0.5, recall: 1 },
        { label: 'deny', truePositive: 0, falsePositive: 0, falseNegative: 1, precision: 0, recall: 0 },
      ],
    })
  })

  it.each([
    ['missing case', [observation('exact', 'exact-value', 'Human review required')]],
    ['unknown case', [...set.cases.map((item) => observation(item.id, item.class, item.class === 'retrieval' ? ['policy'] : item.class === 'classification' ? 'allow' : 'Human review required')), observation('other', 'exact-value', true)]],
    ['wrong version', [observation('exact', 'exact-value', 'Human review required'), observation('allow', 'classification', 'allow'), observation('deny', 'classification', 'deny'), { ...observation('sources', 'retrieval', ['policy']), evaluationSetVersion: 'eval-v2' }]],
  ])('fails closed on %s evidence', (_name, observations) => {
    expect(() => evaluateQualitySet(set, observations)).toThrow(QualityEvaluationError)
  })

  it('rejects unknown contract fields and duplicate case identities', () => {
    expect(() => parseEvaluationSet({ ...set, approvalThreshold: 0.9 })).toThrow(/exactly/)
    expect(() => parseEvaluationSet({ ...set, cases: [...set.cases, { ...set.cases[0], sequence: 9 }] })).toThrow(/Duplicate evaluation case id/)
    expect(() => parseEvaluationSet({ ...set, cases: [{ id: 'bad', sequence: 1, class: 'exact-value', comparison: 'strict', expected: Number.NaN }] })).toThrow(/invalid/)
  })

  it('adapts one correlated workflow case without modifying the executor', async () => {
    const evaluate = createDeterministicQualityEvaluator(set)
    const compatible: WorkflowJourneyExecutorOptions['evaluateQuality'] = evaluate
    expect(compatible).toBe(evaluate)
    const response = {
      proof: { evidence: { status: 'complete', items: [observation('allow', 'classification', 'allow')] } },
    }
    await expect(evaluate({ response, sequence: 2, profile: { evaluationSetVersion: 'eval-v1' } })).resolves.toBe(1)
  })

  it('scores an explicit empty retrieval result as zero rather than treating it as missing evidence', () => {
    const report = evaluateQualitySet({ ...set, cases: [set.cases[3]] }, [observation('sources', 'retrieval', [])])
    expect(report.cases[0]).toMatchObject({ score: 0, precision: 0, recall: 0 })
  })

  it.each([
    ['incomplete source evidence', { proof: { evidence: { status: 'partial', items: [] } } }, 1, 'eval-v1'],
    ['missing sequence', { proof: { evidence: { status: 'complete', items: [] } } }, 99, 'eval-v1'],
    ['profile version mismatch', { proof: { evidence: { status: 'complete', items: [] } } }, 1, 'eval-v2'],
    ['missing observation', { proof: { evidence: { status: 'complete', items: [] } } }, 1, 'eval-v1'],
  ])('fails the workflow adapter closed on %s', async (_name, response, sequence, evaluationSetVersion) => {
    const evaluate = createDeterministicQualityEvaluator(set)
    await expect(evaluate({ response, sequence, profile: { evaluationSetVersion } })).rejects.toThrow(QualityEvaluationError)
  })
})
