export type RegressionPoint = { x: number; y: number }

export type RegressionResult = {
  slope: number
  intercept: number
  rSquared: number
  predictedNextValue: number
  pointsUsed: RegressionPoint[]
}

export function linearRegression(points: RegressionPoint[]): RegressionResult | null {
  if (points.length < 2) return null

  const n = points.length
  const sumX = points.reduce((sum, point) => sum + point.x, 0)
  const sumY = points.reduce((sum, point) => sum + point.y, 0)
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0)
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0)
  const denominator = n * sumXX - sumX * sumX
  if (denominator === 0) return null

  const slope = (n * sumXY - sumX * sumY) / denominator
  const intercept = (sumY - slope * sumX) / n
  const meanY = sumY / n
  const ssTotal = points.reduce((sum, point) => sum + (point.y - meanY) ** 2, 0)
  const ssResidual = points.reduce((sum, point) => sum + (point.y - (slope * point.x + intercept)) ** 2, 0)
  const rSquared = ssTotal === 0 ? 1 : 1 - ssResidual / ssTotal
  const nextX = Math.max(...points.map((point) => point.x)) + 1

  return {
    slope,
    intercept,
    rSquared,
    predictedNextValue: Math.min(100, Math.max(0, slope * nextX + intercept)),
    pointsUsed: points,
  }
}

export function median(values: number[]) {
  if (!values.length) return 0
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

export function standardDeviation(values: number[]) {
  if (!values.length) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  return Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length)
}
