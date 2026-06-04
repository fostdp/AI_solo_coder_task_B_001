import { describe, it, expect, beforeEach } from 'vitest'
import { CorrelationAnalyzer, createCorrelationAnalyzer } from './correlation-analyzer.js'

describe('CorrelationAnalyzer', () => {
  let analyzer: CorrelationAnalyzer

  beforeEach(() => {
    analyzer = createCorrelationAnalyzer()
    analyzer.setAnomalyThreshold(0.1)
    analyzer.setMinAlarmDeviceCount(2)
  })

  describe('基本功能测试', () => {
    it('应该能够创建关联分析器实例', () => {
      expect(analyzer).toBeInstanceOf(CorrelationAnalyzer)
    })

    it('应该能够注册告警', () => {
      analyzer.registerAlarm('T001-001', 'overheat')
      expect(analyzer.getAlarmCount('WS-001')).toBe(1)
    })

    it('应该能够清除告警', () => {
      analyzer.registerAlarm('T001-001', 'overheat')
      analyzer.clearAlarm('T001-001', 'overheat')
      expect(analyzer.getAlarmCount('WS-001')).toBe(0)
    })

    it('应该能够获取配置', () => {
      const config = analyzer.getConfig()
      expect(config.anomalyThreshold).toBe(0.1)
      expect(config.minAlarmDeviceCount).toBe(2)
    })
  })

  describe('车间状态测试', () => {
    it('应该能够获取车间状态', () => {
      const status = analyzer.getWorkshopStatus('WS-001')
      expect(status).not.toBeNull()
      expect(status?.workshopId).toBe('WS-001')
      expect(status?.activeAlarms).toBe(0)
    })

    it('应该能够获取所有车间状态', () => {
      analyzer.registerAlarm('T001-001', 'overheat')
      analyzer.registerAlarm('T002-001', 'overheat')

      const statuses = analyzer.getAllWorkshopStatuses()
      expect(statuses.length).toBeGreaterThanOrEqual(2)
    })
  })

  describe('异常检测测试', () => {
    it('告警数量不足时不应该触发异常', () => {
      analyzer.registerAlarm('T001-001', 'overheat')
      expect(analyzer.hasActiveAnomaly('WS-001')).toBe(false)
    })

    it('满足比例和绝对数量时应该触发异常', () => {
      analyzer.setAnomalyThreshold(0.1)
      analyzer.setMinAlarmDeviceCount(2)

      for (let i = 1; i <= 25; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }

      expect(analyzer.hasActiveAnomaly('WS-001')).toBe(true)
    })

    it('满足比例但不满足绝对数量时不应该触发异常', () => {
      analyzer.setMinAlarmDeviceCount(5)

      for (let i = 1; i <= 4; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }

      expect(analyzer.hasActiveAnomaly('WS-001')).toBe(false)
    })

    it('满足绝对数量但不满足比例时不应该触发异常', () => {
      analyzer.setAnomalyThreshold(0.9)
      analyzer.setMinAlarmDeviceCount(2)

      analyzer.registerAlarm('T001-001', 'overheat')
      analyzer.registerAlarm('T001-002', 'overheat')

      expect(analyzer.hasActiveAnomaly('WS-001')).toBe(false)
    })
  })

  describe('异常详情测试', () => {
    it('应该生成异常详情', () => {
      analyzer.setMinAlarmDeviceCount(2)

      for (let i = 1; i <= 25; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }

      const anomaly = analyzer.getWorkshopAnomaly('WS-001')
      expect(anomaly).not.toBeNull()
      expect(anomaly?.workshopId).toBe('WS-001')
      expect(anomaly?.isActive).toBe(true)
      expect(anomaly?.description).toContain('比例')
      expect(anomaly?.description).toContain('绝对数量')
    })

    it('应该包含受影响的传感器列表', () => {
      analyzer.setMinAlarmDeviceCount(2)

      for (let i = 1; i <= 25; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }

      const anomaly = analyzer.getWorkshopAnomaly('WS-001')
      expect(anomaly?.affectedSensorIds).toContain('T001-001')
      expect(anomaly?.affectedSensorIds).toContain('T001-002')
    })

    it('应该包含处理建议', () => {
      analyzer.setMinAlarmDeviceCount(2)

      for (let i = 1; i <= 25; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }

      const anomaly = analyzer.getWorkshopAnomaly('WS-001')
      expect(anomaly?.recommendations.length).toBeGreaterThan(0)
    })

    it('应该根据告警百分比设置严重程度', () => {
      analyzer.setMinAlarmDeviceCount(2)
      analyzer.setWarningThreshold(0.1)

      for (let i = 1; i <= 80; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }
      for (let i = 1; i <= 30; i++) {
        analyzer.registerAlarm(`V001-${String(i).padStart(3, '0')}`, 'vibration')
      }

      const anomaly = analyzer.getWorkshopAnomaly('WS-001')
      expect(anomaly?.severity).toBe('warning')
    })
  })

  describe('异常恢复测试', () => {
    it('告警消除后应该解除异常状态', () => {
      analyzer.setMinAlarmDeviceCount(2)

      for (let i = 1; i <= 25; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }
      expect(analyzer.hasActiveAnomaly('WS-001')).toBe(true)

      for (let i = 1; i <= 25; i++) {
        analyzer.clearAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }
      expect(analyzer.hasActiveAnomaly('WS-001')).toBe(false)
    })

    it('解除异常后异常状态应该标记为非活跃', () => {
      analyzer.setMinAlarmDeviceCount(2)

      for (let i = 1; i <= 25; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }

      for (let i = 1; i <= 25; i++) {
        analyzer.clearAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }

      const anomaly = analyzer.getWorkshopAnomaly('WS-001')
      expect(anomaly?.isActive).toBe(false)
    })
  })

  describe('多车间独立测试', () => {
    it('各车间状态应该独立计算', () => {
      analyzer.setMinAlarmDeviceCount(2)

      for (let i = 1; i <= 25; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
      }
      analyzer.registerAlarm('T002-001', 'overheat')

      expect(analyzer.hasActiveAnomaly('WS-001')).toBe(true)
      expect(analyzer.hasActiveAnomaly('WS-002')).toBe(false)
    })

    it('应该能够获取所有活跃异常', () => {
      analyzer.setMinAlarmDeviceCount(2)

      for (let i = 1; i <= 25; i++) {
        analyzer.registerAlarm(`T001-${String(i).padStart(3, '0')}`, 'overheat')
        analyzer.registerAlarm(`T002-${String(i).padStart(3, '0')}`, 'overheat')
      }

      const anomalies = analyzer.getAllWorkshopAnomalies()
      expect(anomalies.length).toBe(2)
    })
  })

  describe('配置管理测试', () => {
    it('应该能够设置异常阈值', () => {
      analyzer.setAnomalyThreshold(0.5)
      expect(analyzer.getConfig().anomalyThreshold).toBe(0.5)
    })

    it('异常阈值应该有最小值限制', () => {
      analyzer.setAnomalyThreshold(0.01)
      expect(analyzer.getConfig().anomalyThreshold).toBe(0.1)
    })

    it('异常阈值应该有最大值限制', () => {
      analyzer.setAnomalyThreshold(1.5)
      expect(analyzer.getConfig().anomalyThreshold).toBe(1.0)
    })

    it('应该能够设置最小告警设备数量', () => {
      analyzer.setMinAlarmDeviceCount(10)
      expect(analyzer.getConfig().minAlarmDeviceCount).toBe(10)
    })

    it('最小告警设备数量应该有最小值限制', () => {
      analyzer.setMinAlarmDeviceCount(0)
      expect(analyzer.getConfig().minAlarmDeviceCount).toBe(1)
    })
  })

  describe('清除功能测试', () => {
    it('应该能够清除单个车间的所有告警', () => {
      analyzer.registerAlarm('T001-001', 'overheat')
      analyzer.registerAlarm('T001-002', 'overheat')
      analyzer.registerAlarm('T002-001', 'overheat')

      analyzer.clearAllAlarmsForWorkshop('WS-001')

      expect(analyzer.getAlarmCount('WS-001')).toBe(0)
      expect(analyzer.getAlarmCount('WS-002')).toBe(1)
    })

    it('应该能够清除所有告警', () => {
      analyzer.registerAlarm('T001-001', 'overheat')
      analyzer.registerAlarm('T002-001', 'overheat')

      analyzer.clearAll()

      expect(analyzer.getAlarmCount('WS-001')).toBe(0)
      expect(analyzer.getAlarmCount('WS-002')).toBe(0)
    })
  })

  describe('边界条件测试', () => {
    it('不存在的传感器ID应该被忽略', () => {
      expect(() => {
        analyzer.registerAlarm('INVALID_SENSOR', 'overheat')
      }).not.toThrow()
      expect(analyzer.getAlarmCount('WS-001')).toBe(0)
    })

    it('不存在的车间状态应该返回null', () => {
      const status = analyzer.getWorkshopStatus('NON_EXISTENT')
      expect(status).toBeNull()
    })

    it('同一个传感器多个告警类型只计数一次', () => {
      analyzer.registerAlarm('T001-001', 'overheat')
      analyzer.registerAlarm('T001-001', 'offline')

      expect(analyzer.getAlarmCount('WS-001')).toBe(1)
    })

    it('清除不存在的告警不应该出错', () => {
      expect(() => {
        analyzer.clearAlarm('T001-001', 'overheat')
      }).not.toThrow()
    })
  })
})
