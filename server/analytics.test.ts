import { strict as assert } from 'node:assert'
import { test } from 'node:test'
import { linearRegression } from './analytics.js'

test('linear regression matches a known increasing series', () => {
  const result = linearRegression([{ x: 1, y: 60 }, { x: 2, y: 70 }, { x: 3, y: 80 }])
  assert.ok(result)
  assert.equal(result.slope, 10)
  assert.equal(result.intercept, 50)
  assert.equal(result.predictedNextValue, 90)
  assert.equal(result.rSquared, 1)
})

test('linear regression returns null with one point', () => {
  assert.equal(linearRegression([{ x: 1, y: 60 }]), null)
})
