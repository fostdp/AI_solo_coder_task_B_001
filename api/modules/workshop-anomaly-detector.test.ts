import { describe, it, expect, beforeEach } from 'vitest'
import { createWorkshopAnomalyDetector } from './workshop-anomaly-detector.js'
import { getSensorsByWorkshop } from '../../config/sensors.js'

describe('WorkshopAnomalyDetector', () => {
  let detector: ReturnType<typeof createWorkshopAnomalyDetector>

  beforeEach(() => {
    detector = createWorkshopAnomalyDetector()
    detector.clearAll()
  })

  describe('30%阈值触发测试', () => {
    it('当告警设备超过30%时应该触发车间级异常', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)

      for (let i = 0; i < Math.ceil(sensors.length * 0.1); i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const status = detector.getWorkshopStatus(workshopId)
      expect(status).toBeDefined()
      expect(status?.isAnomaly).toBe(true)
      expect(status?.anomalyLevel).toBe('anomaly')
      expect(detector.hasActiveAnomaly(workshopId)).toBe(true)
    })

    it('触发异常时应该生成关联告警消息', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)

      for (let i = 0; i < Math.ceil(sensors.length * 0.1); i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const anomaly = detector.getWorkshopAnomaly(workshopId)
      expect(anomaly).toBeDefined()
      expect(anomaly?.description).toContain('超过')
      expect(anomaly?.description).toContain('车间级异常')
      expect(anomaly?.recommendations.length).toBeGreaterThan(0)
      expect(anomaly?.severity).toBeDefined()
      expect(anomaly?.isActive).toBe(true)
    })

    it('应该正确记录受影响的传感器列表', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)
      const count = Math.ceil(sensors.length * 0.1)

      for (let i = 0; i < count; i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const anomaly = detector.getWorkshopAnomaly(workshopId)
      expect(anomaly?.affectedSensorIds.length).toBeGreaterThanOrEqual(count)
    })

    it('当在30%-50%之间时应该标记为warning级别', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)

      for (let i = 0; i < Math.ceil(sensors.length * 0.1); i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const anomaly = detector.getWorkshopAnomaly(workshopId)
      expect(anomaly?.severity).toBe('warning')
    })
  })

  describe('阈值边界测试', () => {
    it('刚好达到阈值时应该触发异常', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)

      const count = Math.ceil(sensors.length * 0.1)
      for (let i = 0; i < count; i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const status = detector.getWorkshopStatus(workshopId)
      expect(status?.alarmPercent).toBeGreaterThanOrEqual(0.1)
      expect(status?.isAnomaly).toBe(true)
    })

    it('低于阈值时不应该触发异常', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)

      for (let i = 0; i < 3; i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const status = detector.getWorkshopStatus(workshopId)
      expect(status?.alarmPercent).toBeLessThan(0.3)
      expect(status?.isAnomaly).toBe(false)
      expect(detector.hasActiveAnomaly(workshopId)).toBe(false)
    })

    it('在15%-30%之间时应该标记为attention级别', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)

      const attentionCount = Math.ceil(sensors.length * 0.2)
      detector.setAnomalyThreshold(0.25)

      for (let i = 0; i < attentionCount; i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const status = detector.getWorkshopStatus(workshopId)
      expect(status?.anomalyLevel).toBe('attention')
      expect(status?.isAnomaly).toBe(false)
    })

    it('低于15%时应该标记为normal级别', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)

      for (let i = 0; i < 3; i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const status = detector.getWorkshopStatus(workshopId)
      expect(status?.anomalyLevel).toBe('normal')
    })

    it('绝对数量不足5台时即使比例达标也不应触发异常', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)
      detector.setMinAlarmDeviceCount(5)

      for (let i = 0; i < 4; i++) {
        if (sensors[i]) {
          detector.registerAlarm(sensors[i].id, 'overheat')
        }
      }

      const status = detector.getWorkshopStatus(workshopId)
      expect(status?.isAnomaly).toBe(false)
      expect(detector.hasActiveAnomaly(workshopId)).toBe(false)
    })

    it('绝对数量达到5台且比例达标时应该触发异常', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)
      detector.setMinAlarmDeviceCount(5)

      const count = Math.ceil(sensors.length * 0.1)
      for (let i = 0; i < count; i++) {
        if (sensors[i]) {
          detector.registerAlarm(sensors[i].id, 'overheat')
        }
      }

      const status = detector.getWorkshopStatus(workshopId)
      expect(status?.isAnomaly).toBe(true)
      expect(detector.hasActiveAnomaly(workshopId)).toBe(true)
    })
  })

  describe('告警消除后恢复测试', () => {
    it('告警消除后低于阈值时应该解除异常状态', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)

      const count = Math.ceil(sensors.length * 0.1) + 2
      for (let i = 0; i < count; i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      expect(detector.hasActiveAnomaly(workshopId)).toBe(true)

      detector.setAnomalyThreshold(0.5)

      detector.clearAll()
      detector.setAnomalyThreshold(0.1)

      for (let i = 0; i < 3; i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      expect(detector.hasActiveAnomaly(workshopId)).toBe(false)
    })

    it('所有告警消除后应该恢复到normal状态', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)

      const thresholdCount = Math.ceil(sensors.length * 0.1)
      const alarmSensors: string[] = []
      for (let i = 0; i < thresholdCount; i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
          alarmSensors.push(sensor.id)
        }
      }

      for (const sensorId of alarmSensors) {
        detector.clearAlarm(sensorId, 'overheat')
      }

      const status = detector.getWorkshopStatus(workshopId)
      expect(status?.activeAlarms).toBe(0)
      expect(status?.alarmPercent).toBe(0)
      expect(status?.anomalyLevel).toBe('normal')
      expect(status?.isAnomaly).toBe(false)
    })
  })

  describe('关联告警消息测试', () => {
    it('应该生成包含告警百分比和绝对数量的描述信息', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)

      for (let i = 0; i < Math.ceil(sensors.length * 0.1); i++) {
        const sensor = sensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const anomaly = detector.getWorkshopAnomaly(workshopId)
      expect(anomaly?.description).toContain('%')
      expect(anomaly?.description).toContain('≥5')
      expect(anomaly?.alarmDevicePercent).toBeGreaterThanOrEqual(0.1)
    })

    it('过热告警较多时应该包含冷却系统检查建议', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      detector.setAnomalyThreshold(0.1)

      const tempSensors = sensors.filter(s => s.type === 'temperature')
      for (let i = 0; i < Math.ceil(sensors.length * 0.1); i++) {
        const sensor = tempSensors[i]
        if (sensor) {
          detector.registerAlarm(sensor.id, 'overheat')
        }
      }

      const anomaly = detector.getWorkshopAnomaly(workshopId)
      if (anomaly) {
        const hasCoolingRec = anomaly.recommendations.some(r =>
          r.includes('冷却') || r.includes('温度')
        )
        expect(hasCoolingRec).toBe(true)
      }
    })
  })

  describe('异常场景测试', () => {
    it('处理不存在的传感器ID', () => {
      expect(() => {
        detector.registerAlarm('NON_EXISTENT_SENSOR', 'overheat')
      }).not.toThrow()

      const stats = detector.getStatistics()
      expect(stats.workshopsWithAlarms).toBe(0)
    })

    it('处理重复的告警注册', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      const sensor = sensors[0]

      if (sensor) {
        detector.registerAlarm(sensor.id, 'overheat')
        detector.registerAlarm(sensor.id, 'overheat')
        detector.registerAlarm(sensor.id, 'overheat')

        const status = detector.getWorkshopStatus(workshopId)
        expect(status?.activeAlarms).toBe(1)
      }
    })

    it('清除不存在的告警', () => {
      expect(() => {
        detector.clearAlarm('NON_EXISTENT_SENSOR', 'overheat')
      }).not.toThrow()
    })

    it('获取不存在车间的状态', () => {
      const status = detector.getWorkshopStatus('NON_EXISTENT_WS')
      expect(status).toBeUndefined()
    })

    it('应该正确区分不同类型的告警', () => {
      const workshopId = 'WS-001'
      const sensors = getSensorsByWorkshop(workshopId)
      const sensor = sensors[0]

      if (sensor) {
        detector.registerAlarm(sensor.id, 'overheat')
        detector.registerAlarm(sensor.id, 'offline')

        const status = detector.getWorkshopStatus(workshopId)
        expect(status?.activeAlarms).toBe(2)
      }
    })
  })

  describe('多车间独立测试', () => {
    it('各车间状态应该独立计算', () => {
      const ws1Sensors = getSensorsByWorkshop('WS-001')
      const ws2Sensors = getSensorsByWorkshop('WS-002')
      detector.setAnomalyThreshold(0.1)

      for (let i = 0; i < Math.ceil(ws1Sensors.length * 0.1); i++) {
        if (ws1Sensors[i]) {
          detector.registerAlarm(ws1Sensors[i].id, 'overheat')
        }
      }

      for (let i = 0; i < 3; i++) {
        if (ws2Sensors[i]) {
          detector.registerAlarm(ws2Sensors[i].id, 'overheat')
        }
      }

      expect(detector.hasActiveAnomaly('WS-001')).toBe(true)
      expect(detector.hasActiveAnomaly('WS-002')).toBe(false)
    })

    it('应该能获取所有车间状态', () => {
      const statuses = detector.getAllWorkshopStatuses()
      expect(statuses.length).toBeGreaterThanOrEqual(3)
      statuses.forEach(status => {
        expect(status.workshopId).toMatch(/^WS-\d{3}$/)
        expect(status.workshopName).toBeDefined()
      })
    })
  })

  describe('阈值配置测试', () => {
    it('应该能够自定义异常阈值', () => {
      detector.setAnomalyThreshold(0.5)
      expect(detector.getAnomalyThreshold()).toBe(0.5)
    })

    it('阈值应该限制在合理范围内', () => {
      detector.setAnomalyThreshold(-0.1)
      expect(detector.getAnomalyThreshold()).toBe(0.1)

      detector.setAnomalyThreshold(1.5)
      expect(detector.getAnomalyThreshold()).toBe(1.0)
    })

    it('应该能够自定义最小告警设备数量', () => {
      detector.setMinAlarmDeviceCount(10)
      expect(detector.getMinAlarmDeviceCount()).toBe(10)
    })

    it('最小告警设备数量应该限制在合理范围内', () => {
      detector.setMinAlarmDeviceCount(0)
      expect(detector.getMinAlarmDeviceCount()).toBe(1)

      detector.setMinAlarmDeviceCount(2000)
      expect(detector.getMinAlarmDeviceCount()).toBe(1000)
    })
  })

  describe('统计功能测试', () => {
    it('应该正确返回统计信息', () => {
      const stats = detector.getStatistics()
      expect(stats.totalWorkshops).toBeGreaterThanOrEqual(3)
      expect(typeof stats.workshopsWithAlarms).toBe('number')
      expect(typeof stats.activeAnomalies).toBe('number')
      expect(typeof stats.criticalAnomalies).toBe('number')
    })

    it('获取告警车间列表', () => {
      const ws1Sensors = getSensorsByWorkshop('WS-001')
      if (ws1Sensors[0]) {
        detector.registerAlarm(ws1Sensors[0].id, 'overheat')
      }

      const workshopsWithAlarms = detector.getWorkshopsWithAlarms()
      expect(workshopsWithAlarms).toContain('WS-001')
    })
  })
})
