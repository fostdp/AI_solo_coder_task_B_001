import { getSensorById, type SensorConfig } from '../../config/sensors.js'

export interface PredictEngineConfig {
  historyWindowMinutes: number
  predictionHorizonMinutes: number
  warningThresholdPercent: number
  minDataPoints: number
}

export interface SensorPrediction {
  sensorId: string
  sensorType: 'temperature' | 'vibration'
  predictedValue: number
  currentValue: number
  threshold: number
  confidence: number
  trend: 'rising' | 'falling' | 'stable'
  willTriggerAlarm: boolean
  isWarning: boolean
  predictedTime: Date
  historyPoints: number
}

export interface WorkshopPrediction {
  workshopId: string
  predictions: SensorPrediction[]
  atRiskCount: number
  totalSensors: number
  riskLevel: 'low' | 'medium' | 'high'
}

interface RegressionCache {
  n: number
  sumX: number
  sumY: number
  sumXY: number
  sumXX: number
  slope: number
  intercept: number
  rSquared: number
  firstTimestamp: number
  lastTimestamp: number
  lastValue: number
}

interface HistoryPoint {
  value: number
  timestamp: number
}

export class PredictEngine {
  private history: Map<string, HistoryPoint[]> = new Map()
  private cache: Map<string, RegressionCache> = new Map()
  private predictions: Map<string, SensorPrediction> = new Map()
  private config: PredictEngineConfig

  constructor(config: Partial<PredictEngineConfig> = {}) {
    this.config = {
      historyWindowMinutes: config.historyWindowMinutes ?? 30,
      predictionHorizonMinutes: config.predictionHorizonMinutes ?? 5,
      warningThresholdPercent: config.warningThresholdPercent ?? 80,
      minDataPoints: config.minDataPoints ?? 6,
    }
  }

  public addSensorData(sensorId: string, value: number, timestamp: Date): void {
    const now = timestamp.getTime()
    const windowMs = this.config.historyWindowMinutes * 60 * 1000

    if (!this.history.has(sensorId)) {
      this.history.set(sensorId, [])
    }

    const sensorHistory = this.history.get(sensorId)!
    sensorHistory.push({ value, timestamp: now })

    const cutoffTime = now - windowMs
    const filteredHistory = sensorHistory.filter(h => h.timestamp >= cutoffTime)
    this.history.set(sensorId, filteredHistory)

    this.invalidateCache(sensorId)
  }

  private invalidateCache(sensorId: string): void {
    this.cache.delete(sensorId)
  }

  private getOrComputeRegression(sensorId: string): RegressionCache | null {
    const cached = this.cache.get(sensorId)
    if (cached) {
      return cached
    }

    const history = this.history.get(sensorId) || []
    if (history.length < this.config.minDataPoints) {
      return null
    }

    const result = this.computeRegression(history)
    if (result) {
      this.cache.set(sensorId, result)
    }
    return result
  }

  private computeRegression(points: HistoryPoint[]): RegressionCache | null {
    if (points.length < 2) {
      return null
    }

    const firstTimestamp = points[0].timestamp
    const xs = points.map(p => (p.timestamp - firstTimestamp) / 1000)
    const ys = points.map(p => p.value)

    const n = xs.length
    const sumX = xs.reduce((a, b) => a + b, 0)
    const sumY = ys.reduce((a, b) => a + b, 0)
    const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0)
    const sumXX = xs.reduce((sum, x) => sum + x * x, 0)

    const denominator = n * sumXX - sumX * sumX
    if (Math.abs(denominator) < 1e-10) {
      return null
    }

    const slope = (n * sumXY - sumX * sumY) / denominator
    const intercept = (sumY - slope * sumX) / n

    if (!Number.isFinite(slope) || !Number.isFinite(intercept)) {
      return null
    }

    const yMean = sumY / n
    const ssTotal = ys.reduce((sum, y) => sum + (y - yMean) ** 2, 0)
    const ssResidual = ys.reduce((sum, y, i) => {
      const predicted = slope * xs[i] + intercept
      return sum + (y - predicted) ** 2
    }, 0)

    const rSquared = ssTotal > 0 ? 1 - ssResidual / ssTotal : 0

    return {
      n,
      sumX,
      sumY,
      sumXY,
      sumXX,
      slope,
      intercept,
      rSquared,
      firstTimestamp,
      lastTimestamp: points[points.length - 1].timestamp,
      lastValue: points[points.length - 1].value,
    }
  }

  public predictForSensor(sensorId: string): SensorPrediction | null {
    try {
      const sensor = getSensorById(sensorId)
      if (!sensor) return null

      if (sensor.type !== 'temperature' && sensor.type !== 'vibration') {
        return null
      }

      const regression = this.getOrComputeRegression(sensorId)
      if (!regression) {
        return null
      }

      const { slope, intercept, rSquared, firstTimestamp, lastTimestamp, lastValue } = regression

      if (!Number.isFinite(slope) || !Number.isFinite(intercept) || !Number.isFinite(rSquared)) {
        return null
      }

      const predictionHorizonMs = this.config.predictionHorizonMinutes * 60 * 1000
      const predictionTimestamp = lastTimestamp + predictionHorizonMs

      const xPrediction = (predictionTimestamp - firstTimestamp) / 1000
      const predictedValue = slope * xPrediction + intercept

      if (!Number.isFinite(predictedValue)) {
        return null
      }

      const currentValue = lastValue
      const threshold = sensor.type === 'temperature'
        ? (sensor.maxAllowedTemp || 70)
        : (sensor.vibrationThreshold || 5.0)

      const trend = Math.abs(slope) < 0.001 ? 'stable' : (slope > 0 ? 'rising' : 'falling')
      const willTriggerAlarm = predictedValue >= threshold
      const warningThreshold = threshold * (this.config.warningThresholdPercent / 100)
      const isWarning = predictedValue >= warningThreshold && !willTriggerAlarm

      const prediction: SensorPrediction = {
        sensorId,
        sensorType: sensor.type,
        predictedValue: Math.max(0, predictedValue),
        currentValue,
        threshold,
        confidence: Math.max(0, Math.min(1, rSquared)),
        trend,
        willTriggerAlarm,
        isWarning,
        predictedTime: new Date(predictionTimestamp),
        historyPoints: regression.n,
      }

      this.predictions.set(sensorId, prediction)
      return prediction
    } catch {
      return null
    }
  }

  public predictAll(): SensorPrediction[] {
    const predictions: SensorPrediction[] = []
    for (const sensorId of this.history.keys()) {
      const prediction = this.predictForSensor(sensorId)
      if (prediction) {
        predictions.push(prediction)
      }
    }
    return predictions
  }

  public predictForWorkshop(workshopId: string): WorkshopPrediction {
    const workshopSensors = this.getSensorsByWorkshop(workshopId)
    const predictions: SensorPrediction[] = []

    for (const sensor of workshopSensors) {
      const prediction = this.predictForSensor(sensor.id)
      if (prediction) {
        predictions.push(prediction)
      }
    }

    const atRiskCount = predictions.filter(p => p.isWarning || p.willTriggerAlarm).length
    const totalSensors = workshopSensors.length

    const riskRatio = totalSensors > 0 ? atRiskCount / totalSensors : 0
    let riskLevel: 'low' | 'medium' | 'high' = 'low'
    if (riskRatio >= 0.3) riskLevel = 'high'
    else if (riskRatio >= 0.1) riskLevel = 'medium'

    return {
      workshopId,
      predictions,
      atRiskCount,
      totalSensors,
      riskLevel,
    }
  }

  public getWarnings(): SensorPrediction[] {
    return Array.from(this.predictions.values())
      .filter(p => p.isWarning && !p.willTriggerAlarm)
      .sort((a, b) => b.predictedValue / b.threshold - a.predictedValue / a.threshold)
  }

  public getPredictedAlarms(): SensorPrediction[] {
    return Array.from(this.predictions.values())
      .filter(p => p.willTriggerAlarm)
      .sort((a, b) => b.predictedValue - a.predictedValue)
  }

  private getSensorsByWorkshop(workshopId: string): SensorConfig[] {
    const result: SensorConfig[] = []
    for (const sensorId of this.history.keys()) {
      const sensor = getSensorById(sensorId)
      if (sensor && sensor.workshopId === workshopId) {
        result.push(sensor)
      }
    }
    return result
  }

  public getConfig(): PredictEngineConfig {
    return { ...this.config }
  }

  public updateConfig(config: Partial<PredictEngineConfig>): void {
    this.config = { ...this.config, ...config }
    this.cache.clear()
  }

  public clearHistory(sensorId?: string): void {
    if (sensorId) {
      this.history.delete(sensorId)
      this.cache.delete(sensorId)
      this.predictions.delete(sensorId)
    } else {
      this.history.clear()
      this.cache.clear()
      this.predictions.clear()
    }
  }

  public getHistorySize(sensorId?: string): number {
    if (sensorId) {
      return this.history.get(sensorId)?.length || 0
    }
    let total = 0
    for (const h of this.history.values()) {
      total += h.length
    }
    return total
  }

  public isCached(sensorId: string): boolean {
    return this.cache.has(sensorId)
  }

  public getCacheStats(): { total: number; cached: number } {
    return {
      total: this.history.size,
      cached: this.cache.size,
    }
  }
}

export function createPredictEngine(config?: Partial<PredictEngineConfig>): PredictEngine {
  return new PredictEngine(config)
}
