import { describe, it, expect, beforeEach, vi } from 'vitest'
import { PredictEngine, createPredictEngine } from './predict-engine.js'

describe('PredictEngine', () => {
  let engine: PredictEngine

  beforeEach(() => {
    engine = createPredictEngine({
      historyWindowMinutes: 30,
      minDataPoints: 3,
    })
  })

  describe('基本功能测试', () => {
    it('应该能够创建预测引擎实例', () => {
      expect(engine).toBeInstanceOf(PredictEngine)
    })

    it('应该能够添加传感器数据', () => {
      const now = new Date()
      engine.addSensorData('T001-001', 50, now)
      expect(engine.getHistorySize('T001-001')).toBe(1)
    })

    it('应该能够获取配置', () => {
      const config = engine.getConfig()
      expect(config.historyWindowMinutes).toBe(30)
      expect(config.minDataPoints).toBe(3)
    })

    it('应该能够更新配置', () => {
      engine.updateConfig({ minDataPoints: 10 })
      expect(engine.getConfig().minDataPoints).toBe(10)
    })
  })

  describe('回归缓存测试', () => {
    it('数据不足时预测应该返回null', () => {
      const now = new Date()
      engine.addSensorData('T001-001', 50, now)
      const prediction = engine.predictForSensor('T001-001')
      expect(prediction).toBeNull()
    })

    it('首次预测后应该缓存回归结果', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 10; i++) {
        const time = new Date(baseTime - i * 60000)
        engine.addSensorData('T001-001', 50 + i, time)
      }

      expect(engine.isCached('T001-001')).toBe(false)
      engine.predictForSensor('T001-001')
      expect(engine.isCached('T001-001')).toBe(true)
    })

    it('添加新数据后应该使缓存失效', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 10; i++) {
        const time = new Date(baseTime - i * 60000)
        engine.addSensorData('T001-001', 50 + i, time)
      }

      engine.predictForSensor('T001-001')
      expect(engine.isCached('T001-001')).toBe(true)

      engine.addSensorData('T001-001', 60, new Date())
      expect(engine.isCached('T001-001')).toBe(false)
    })

    it('更新配置后应该清除缓存', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 10; i++) {
        const time = new Date(baseTime - i * 60000)
        engine.addSensorData('T001-001', 50 + i, time)
      }

      engine.predictForSensor('T001-001')
      expect(engine.isCached('T001-001')).toBe(true)

      engine.updateConfig({ warningThresholdPercent: 90 })
      expect(engine.isCached('T001-001')).toBe(false)
    })

    it('应该返回缓存的统计信息', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 10; i++) {
        const time = new Date(baseTime - i * 60000)
        engine.addSensorData('T001-001', 50 + i, time)
        engine.addSensorData('T001-002', 40 + i, time)
      }

      expect(engine.getCacheStats()).toEqual({ total: 2, cached: 0 })

      engine.predictForSensor('T001-001')
      expect(engine.getCacheStats()).toEqual({ total: 2, cached: 1 })

      engine.predictForSensor('T001-002')
      expect(engine.getCacheStats()).toEqual({ total: 2, cached: 2 })
    })
  })

  describe('预测功能测试', () => {
    it('应该能够预测上升趋势', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 20; i++) {
        const time = new Date(baseTime - (20 - i) * 60000)
        engine.addSensorData('T001-001', 50 + i * 0.5, time)
      }

      const prediction = engine.predictForSensor('T001-001')
      expect(prediction).not.toBeNull()
      expect(prediction!.trend).toBe('rising')
      expect(prediction!.confidence).toBeGreaterThan(0.5)
    })

    it('应该能够预测下降趋势', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 20; i++) {
        const time = new Date(baseTime - (20 - i) * 60000)
        engine.addSensorData('T001-001', 70 - i * 0.5, time)
      }

      const prediction = engine.predictForSensor('T001-001')
      expect(prediction).not.toBeNull()
      expect(prediction!.trend).toBe('falling')
    })

    it('应该能够预测稳定趋势', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 20; i++) {
        const time = new Date(baseTime - (20 - i) * 60000)
        engine.addSensorData('T001-001', 50 + (Math.random() - 0.5) * 0.1, time)
      }

      const prediction = engine.predictForSensor('T001-001')
      expect(prediction).not.toBeNull()
      expect(prediction!.trend).toBe('stable')
    })
  })

  describe('批量预测测试', () => {
    it('应该能够预测所有传感器', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 10; i++) {
        const time = new Date(baseTime - i * 60000)
        engine.addSensorData('T001-001', 50 + i, time)
        engine.addSensorData('T001-002', 60 + i, time)
      }

      const predictions = engine.predictAll()
      expect(predictions.length).toBe(2)
    })

    it('应该能够按车间预测', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 10; i++) {
        const time = new Date(baseTime - i * 60000)
        engine.addSensorData('T001-001', 50 + i, time)
        engine.addSensorData('T001-002', 60 + i, time)
      }

      const workshopPrediction = engine.predictForWorkshop('WS-001')
      expect(workshopPrediction.workshopId).toBe('WS-001')
      expect(workshopPrediction.predictions.length).toBeGreaterThan(0)
    })
  })

  describe('异常场景测试', () => {
    it('不存在的传感器预测应该返回null', () => {
      const prediction = engine.predictForSensor('NON_EXISTENT')
      expect(prediction).toBeNull()
    })

    it('除零保护应该生效', () => {
      const sameTime = new Date()
      for (let i = 0; i < 10; i++) {
        engine.addSensorData('T001-001', 50 + i, sameTime)
      }

      const prediction = engine.predictForSensor('T001-001')
      expect(prediction).toBeNull()
    })

    it('清除历史后缓存也应该清除', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 10; i++) {
        const time = new Date(baseTime - i * 60000)
        engine.addSensorData('T001-001', 50 + i, time)
      }

      engine.predictForSensor('T001-001')
      expect(engine.isCached('T001-001')).toBe(true)

      engine.clearHistory('T001-001')
      expect(engine.isCached('T001-001')).toBe(false)
      expect(engine.getHistorySize('T001-001')).toBe(0)
    })

    it('清除所有历史应该清除所有缓存', () => {
      const baseTime = Date.now()
      for (let i = 0; i < 10; i++) {
        const time = new Date(baseTime - i * 60000)
        engine.addSensorData('T001-001', 50 + i, time)
        engine.addSensorData('T001-002', 60 + i, time)
      }

      engine.predictForSensor('T001-001')
      engine.predictForSensor('T001-002')
      expect(engine.getCacheStats().cached).toBe(2)

      engine.clearHistory()
      expect(engine.getCacheStats().cached).toBe(0)
      expect(engine.getHistorySize()).toBe(0)
    })
  })
})
