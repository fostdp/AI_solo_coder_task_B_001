import { describe, it, expect, beforeEach } from 'vitest'
import { createAlarmPredictor } from './alarm-predictor.js'

describe('AlarmPredictor', () => {
  let predictor: ReturnType<typeof createAlarmPredictor>

  beforeEach(() => {
    predictor = createAlarmPredictor({
      historyWindowMinutes: 30,
      predictionHorizonMinutes: 5,
      warningThresholdPercent: 80,
      minDataPoints: 6,
    })
  })

  function recentBase(minutesAgo: number = 10): Date {
    return new Date(Date.now() - minutesAgo * 60 * 1000)
  }

  describe('线性回归计算正确性', () => {
    it('应该正确计算稳定上升趋势的线性回归', () => {
      const sensorId = 'T001-001'
      const baseTime = recentBase(10)

      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          50 + i * 2,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).not.toBeNull()
      expect(prediction?.trend).toBe('rising')
      expect(prediction?.predictedValue).toBeGreaterThan(68)
      expect(prediction?.confidence).toBeGreaterThan(0.95)
    })

    it('应该正确计算稳定下降趋势的线性回归', () => {
      const sensorId = 'T001-002'
      const baseTime = recentBase(10)

      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          70 - i * 2,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).not.toBeNull()
      expect(prediction?.trend).toBe('falling')
      expect(prediction?.predictedValue).toBeLessThan(52)
      expect(prediction?.confidence).toBeGreaterThan(0.95)
    })

    it('应该正确识别稳定数据', () => {
      const sensorId = 'T001-003'
      const baseTime = recentBase(10)

      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          50 + (Math.random() - 0.5) * 0.1,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).not.toBeNull()
      expect(prediction?.trend).toBe('stable')
      expect(Math.abs(prediction!.predictedValue - 50)).toBeLessThan(1)
    })

    it('应该正确计算置信度R²值', () => {
      const sensorId = 'T001-004'
      const baseTime = recentBase(10)

      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          50 + i * 1,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).not.toBeNull()
      expect(prediction?.confidence).toBeCloseTo(1, 1)
    })
  })

  describe('预测阈值80%的预警触发', () => {
    it('当预测值超过阈值80%时应该触发预警', () => {
      const sensorId = 'T001-005'
      const baseTime = recentBase(10)
      const threshold = 70
      const warningThreshold = threshold * 0.8

      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          warningThreshold - 5 + i * 1.2,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).not.toBeNull()
      expect(prediction?.predictedValue).toBeGreaterThan(warningThreshold)
      expect(prediction?.isWarning).toBe(true)
    })

    it('当预测值低于80%阈值时不应该触发预警', () => {
      const sensorId = 'T001-007'
      const baseTime = recentBase(10)

      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          50,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).not.toBeNull()
      expect(prediction?.predictedValue).toBeLessThan(56)
      expect(prediction?.isWarning).toBe(false)
    })
  })

  describe('预测数据不足时的降级处理', () => {
    it('数据点少于最小要求时应该返回null', () => {
      const sensorId = 'T001-009'
      const baseTime = recentBase(5)

      for (let i = 0; i < 3; i++) {
        predictor.addSensorData(
          sensorId,
          50 + i,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).toBeNull()
    })

    it('数据点正好等于最小要求时应该可以预测', () => {
      const sensorId = 'T001-010'
      const baseTime = recentBase(5)

      for (let i = 0; i < 6; i++) {
        predictor.addSensorData(
          sensorId,
          50 + i,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).not.toBeNull()
      expect(prediction?.historyPoints).toBe(6)
    })
  })

  describe('异常场景测试', () => {
    it('处理不存在的传感器ID', () => {
      const prediction = predictor.predictForSensor('NON_EXISTENT')
      expect(prediction).toBeNull()
    })

    it('处理非温度非振动类型的传感器', () => {
      const prediction = predictor.predictForSensor('W001-001')
      expect(prediction).toBeNull()
    })

    it('正确处理空历史数据', () => {
      predictor.clearHistory()
      const predictions = predictor.predictAll()
      expect(predictions).toEqual([])
    })

    it('单数据点时应该返回null', () => {
      const sensorId = 'T001-014'
      predictor.addSensorData(sensorId, 50, new Date())
      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).toBeNull()
    })

    it('所有数据点时间戳相同时应该降级返回null而非除零崩溃', () => {
      const sensorId = 'T001-020'
      const sameTime = new Date()
      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(sensorId, 50 + i, sameTime)
      }
      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).toBeNull()
    })

    it('设备离线后历史数据不足时应该降级返回null', () => {
      const sensorId = 'T001-021'
      const baseTime = recentBase(10)
      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          50 + i,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).not.toBeNull()

      predictor.clearHistory(sensorId)

      const sparsePrediction = predictor.predictForSensor(sensorId)
      expect(sparsePrediction).toBeNull()
    })

    it('设备离线后历史数据过期时应降级返回null', () => {
      const sensorId = 'T001-023'
      const oldBaseTime = new Date(Date.now() - 60 * 60 * 1000)
      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          50 + i,
          new Date(oldBaseTime.getTime() + i * 60000),
        )
      }

      const historySize = predictor.getHistorySize(sensorId)
      expect(historySize).toBeGreaterThan(0)

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).toBeNull()
    })

    it('设备离线后predictAll不应崩溃而应跳过无效传感器', () => {
      const sensorId = 'T001-024'
      const oldBaseTime = new Date(Date.now() - 60 * 60 * 1000)
      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          sensorId,
          50 + i,
          new Date(oldBaseTime.getTime() + i * 60000),
        )
      }

      const predictions = predictor.predictAll()
      expect(Array.isArray(predictions)).toBe(true)
    })

    it('回归结果为NaN或Infinity时应该降级返回null', () => {
      const sensorId = 'T001-025'
      const baseTime = recentBase(1)
      predictor.addSensorData(sensorId, Infinity, new Date(baseTime.getTime()))
      predictor.addSensorData(sensorId, Infinity, new Date(baseTime.getTime() + 10000))
      predictor.addSensorData(sensorId, Infinity, new Date(baseTime.getTime() + 20000))
      predictor.addSensorData(sensorId, Infinity, new Date(baseTime.getTime() + 30000))
      predictor.addSensorData(sensorId, Infinity, new Date(baseTime.getTime() + 40000))
      predictor.addSensorData(sensorId, Infinity, new Date(baseTime.getTime() + 50000))

      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).toBeNull()
    })

    it('两个相同时间戳的数据点应该返回null', () => {
      const sensorId = 'T001-022'
      const sameTime = new Date()
      predictor.addSensorData(sensorId, 50, sameTime)
      predictor.addSensorData(sensorId, 52, sameTime)
      predictor.addSensorData(sensorId, 54, sameTime)
      predictor.addSensorData(sensorId, 56, sameTime)
      predictor.addSensorData(sensorId, 58, sameTime)
      predictor.addSensorData(sensorId, 60, sameTime)
      const prediction = predictor.predictForSensor(sensorId)
      expect(prediction).toBeNull()
    })
  })

  describe('批量预测功能', () => {
    it('应该能够批量预测所有传感器', () => {
      const baseTime = recentBase(10)

      for (let s = 1; s <= 3; s++) {
        for (let i = 0; i < 10; i++) {
          predictor.addSensorData(
            `T001-00${s}`,
            50 + s * 5 + i,
            new Date(baseTime.getTime() + i * 60000),
          )
        }
      }

      const predictions = predictor.predictAll()
      expect(predictions.length).toBeGreaterThan(0)
      predictions.forEach((p) => {
        expect(p.sensorId).toMatch(/^T\d{3}-\d{3}$/)
        expect(p.predictedValue).toBeDefined()
      })
    })

    it('应该能够获取所有预警', () => {
      const baseTime = recentBase(10)

      for (let i = 0; i < 10; i++) {
        predictor.addSensorData(
          'T001-015',
          60 + i * 0.5,
          new Date(baseTime.getTime() + i * 60000),
        )
      }

      predictor.predictAll()
      const warnings = predictor.getWarnings()
      expect(Array.isArray(warnings)).toBe(true)
    })
  })

  describe('配置更新功能', () => {
    it('应该能够更新配置', () => {
      const newConfig = {
        historyWindowMinutes: 60,
        predictionHorizonMinutes: 10,
        warningThresholdPercent: 90,
        minDataPoints: 10,
      }

      predictor.updateConfig(newConfig)
      const config = predictor.getConfig()

      expect(config.historyWindowMinutes).toBe(60)
      expect(config.predictionHorizonMinutes).toBe(10)
      expect(config.warningThresholdPercent).toBe(90)
      expect(config.minDataPoints).toBe(10)
    })

    it('应该能够部分更新配置', () => {
      predictor.updateConfig({ warningThresholdPercent: 85 })
      const config = predictor.getConfig()

      expect(config.warningThresholdPercent).toBe(85)
      expect(config.historyWindowMinutes).toBe(30)
    })
  })
})
