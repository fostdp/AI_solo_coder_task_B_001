import { describe, it, expect, beforeEach } from 'vitest'
import { useSensorStore } from './index.js'

describe('AutoPlay Feature', () => {
  beforeEach(() => {
    useSensorStore.setState({
      workshops: [
        { id: 'WS-001', name: '一车间', description: '', displayOrder: 1, isEnabled: true },
        { id: 'WS-002', name: '二车间', description: '', displayOrder: 2, isEnabled: true },
        { id: 'WS-003', name: '三车间', description: '', displayOrder: 3, isEnabled: true },
      ],
      selectedWorkshopId: 'WS-001',
      autoPlay: false,
      autoPlayInterval: 10000,
      isPaused: false,
      pauseReason: null,
      workshopAnomalies: new Map(),
      workshopStatuses: new Map(),
      sensors: [],
      predictions: new Map(),
    })
  })

  describe('定时切换测试', () => {
    it('应该能够获取下一个车间', () => {
      const next = useSensorStore.getState().getNextWorkshop()
      expect(next).toBe('WS-002')
    })

    it('应该能够循环切换车间', () => {
      useSensorStore.setState({ selectedWorkshopId: 'WS-003' })
      const next = useSensorStore.getState().getNextWorkshop()
      expect(next).toBe('WS-001')
    })

    it('应该能够设置自动轮播状态', () => {
      useSensorStore.getState().setAutoPlay(true)
      const state = useSensorStore.getState()
      expect(state.autoPlay).toBe(true)
      expect(state.isPaused).toBe(false)
      expect(state.pauseReason).toBeNull()
    })

    it('关闭自动轮播时应该重置暂停状态', () => {
      useSensorStore.getState().setAutoPlay(true)
      useSensorStore.getState().setAutoPlay(false)
      const state = useSensorStore.getState()
      expect(state.autoPlay).toBe(false)
      expect(state.isPaused).toBe(false)
      expect(state.pauseReason).toBeNull()
    })

    it('应该能够设置轮播间隔', () => {
      useSensorStore.getState().setAutoPlayInterval(5000)
      const state = useSensorStore.getState()
      expect(state.autoPlayInterval).toBe(5000)
    })

    it('只启用的车间才会参与轮播', () => {
      useSensorStore.setState({
        workshops: [
          { id: 'WS-001', name: '一车间', description: '', displayOrder: 1, isEnabled: true },
          { id: 'WS-002', name: '二车间', description: '', displayOrder: 2, isEnabled: false },
          { id: 'WS-003', name: '三车间', description: '', displayOrder: 3, isEnabled: true },
        ],
        selectedWorkshopId: 'WS-001',
      })

      const next = useSensorStore.getState().getNextWorkshop()
      expect(next).toBe('WS-003')
    })
  })

  describe('告警时停驻测试', () => {
    it('有新告警时应该自动暂停轮播并跳转到告警车间', () => {
      useSensorStore.getState().setAutoPlay(true)

      const anomaly = {
        id: 'ANOM-001',
        workshopId: 'WS-002',
        workshopName: '二车间',
        type: 'mass_alarm',
        severity: 'critical' as const,
        alarmDeviceCount: 5,
        totalDeviceCount: 10,
        alarmDevicePercent: 0.5,
        affectedSensorIds: [],
        description: '测试异常',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: true,
        startTime: new Date().toISOString(),
      }

      useSensorStore.getState().updateWorkshopAnomaly(anomaly)

      const state = useSensorStore.getState()
      expect(state.isPaused).toBe(true)
      expect(state.pauseReason).toBe('alarm')
      expect(state.selectedWorkshopId).toBe('WS-002')
    })

    it('手动切换车间时应该暂停轮播', () => {
      useSensorStore.getState().setAutoPlay(true)
      useSensorStore.getState().setSelectedWorkshop('WS-002')
      useSensorStore.getState().pauseAutoPlay('manual')

      const state = useSensorStore.getState()
      expect(state.isPaused).toBe(true)
      expect(state.pauseReason).toBe('manual')
    })

    it('应该能够获取所有有活跃异常的车间', () => {
      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-001',
        workshopId: 'WS-001',
        workshopName: '一车间',
        type: 'mass_alarm',
        severity: 'warning' as const,
        alarmDeviceCount: 3,
        totalDeviceCount: 10,
        alarmDevicePercent: 0.3,
        affectedSensorIds: [],
        description: '测试异常1',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: true,
        startTime: new Date().toISOString(),
      })

      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-002',
        workshopId: 'WS-003',
        workshopName: '三车间',
        type: 'mass_alarm',
        severity: 'critical' as const,
        alarmDeviceCount: 6,
        totalDeviceCount: 10,
        alarmDevicePercent: 0.6,
        affectedSensorIds: [],
        description: '测试异常2',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: true,
        startTime: new Date().toISOString(),
      })

      const activeWorkshops = useSensorStore.getState().getActiveAnomalyWorkshops()
      expect(activeWorkshops).toContain('WS-001')
      expect(activeWorkshops).toContain('WS-003')
      expect(activeWorkshops.length).toBe(2)
    })

    it('异常消除后应该从异常列表中移除', () => {
      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-001',
        workshopId: 'WS-001',
        workshopName: '一车间',
        type: 'mass_alarm',
        severity: 'warning' as const,
        alarmDeviceCount: 3,
        totalDeviceCount: 10,
        alarmDevicePercent: 0.3,
        affectedSensorIds: [],
        description: '测试异常',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: true,
        startTime: new Date().toISOString(),
      })

      expect(useSensorStore.getState().getActiveAnomalyWorkshops()).toContain('WS-001')

      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-001',
        workshopId: 'WS-001',
        workshopName: '一车间',
        type: 'mass_alarm',
        severity: 'warning' as const,
        alarmDeviceCount: 0,
        totalDeviceCount: 10,
        alarmDevicePercent: 0,
        affectedSensorIds: [],
        description: '测试异常已消除',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: false,
        startTime: new Date().toISOString(),
      })

      expect(useSensorStore.getState().getActiveAnomalyWorkshops()).not.toContain('WS-001')
      expect(useSensorStore.getState().workshopAnomalies.has('WS-001')).toBe(false)
    })
  })

  describe('告警消除后恢复测试', () => {
    it('所有异常消除后应该可以恢复轮播', () => {
      useSensorStore.getState().setAutoPlay(true)

      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-001',
        workshopId: 'WS-002',
        workshopName: '二车间',
        type: 'mass_alarm',
        severity: 'critical' as const,
        alarmDeviceCount: 5,
        totalDeviceCount: 10,
        alarmDevicePercent: 0.5,
        affectedSensorIds: [],
        description: '测试异常',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: true,
        startTime: new Date().toISOString(),
      })

      expect(useSensorStore.getState().isPaused).toBe(true)

      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-001',
        workshopId: 'WS-002',
        workshopName: '二车间',
        type: 'mass_alarm',
        severity: 'critical' as const,
        alarmDeviceCount: 0,
        totalDeviceCount: 10,
        alarmDevicePercent: 0,
        affectedSensorIds: [],
        description: '测试异常已消除',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: false,
        startTime: new Date().toISOString(),
      })

      useSensorStore.getState().resumeAutoPlay()

      const state = useSensorStore.getState()
      expect(state.isPaused).toBe(false)
      expect(state.pauseReason).toBeNull()
    })

    it('还有活跃异常时不应该恢复轮播', () => {
      useSensorStore.getState().setAutoPlay(true)

      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-001',
        workshopId: 'WS-001',
        workshopName: '一车间',
        type: 'mass_alarm',
        severity: 'warning' as const,
        alarmDeviceCount: 3,
        totalDeviceCount: 10,
        alarmDevicePercent: 0.3,
        affectedSensorIds: [],
        description: '测试异常1',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: true,
        startTime: new Date().toISOString(),
      })

      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-002',
        workshopId: 'WS-002',
        workshopName: '二车间',
        type: 'mass_alarm',
        severity: 'critical' as const,
        alarmDeviceCount: 5,
        totalDeviceCount: 10,
        alarmDevicePercent: 0.5,
        affectedSensorIds: [],
        description: '测试异常2',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: true,
        startTime: new Date().toISOString(),
      })

      useSensorStore.getState().updateWorkshopAnomaly({
        id: 'ANOM-001',
        workshopId: 'WS-001',
        workshopName: '一车间',
        type: 'mass_alarm',
        severity: 'warning' as const,
        alarmDeviceCount: 0,
        totalDeviceCount: 10,
        alarmDevicePercent: 0,
        affectedSensorIds: [],
        description: '测试异常1已消除',
        recommendations: [],
        timestamp: new Date().toISOString(),
        isActive: false,
        startTime: new Date().toISOString(),
      })

      useSensorStore.getState().resumeAutoPlay()

      const state = useSensorStore.getState()
      expect(state.isPaused).toBe(true)
    })

    it('手动暂停后可以手动恢复', () => {
      useSensorStore.getState().setAutoPlay(true)
      useSensorStore.getState().pauseAutoPlay('manual')

      expect(useSensorStore.getState().isPaused).toBe(true)

      useSensorStore.getState().resumeAutoPlay()

      const state = useSensorStore.getState()
      expect(state.isPaused).toBe(false)
      expect(state.pauseReason).toBeNull()
    })

    it('应该能够区分告警暂停和手动暂停', () => {
      useSensorStore.getState().setAutoPlay(true)
      useSensorStore.getState().pauseAutoPlay('manual')
      expect(useSensorStore.getState().pauseReason).toBe('manual')
    })
  })

  describe('异常场景测试', () => {
    it('没有启用的车间时应该保持当前选择', () => {
      useSensorStore.setState({
        workshops: [
          { id: 'WS-001', name: '一车间', description: '', displayOrder: 1, isEnabled: false },
          { id: 'WS-002', name: '二车间', description: '', displayOrder: 2, isEnabled: false },
        ],
        selectedWorkshopId: 'WS-001',
      })

      const next = useSensorStore.getState().getNextWorkshop()
      expect(next).toBe('WS-001')
    })

    it('空车间列表应该正常处理', () => {
      useSensorStore.setState({
        workshops: [],
        selectedWorkshopId: 'WS-001',
      })

      const next = useSensorStore.getState().getNextWorkshop()
      expect(next).toBe('WS-001')
    })

    it('选择不存在的车间应该正常处理', () => {
      useSensorStore.setState({
        workshops: [
          { id: 'WS-001', name: '一车间', description: '', displayOrder: 1, isEnabled: true },
          { id: 'WS-002', name: '二车间', description: '', displayOrder: 2, isEnabled: true },
        ],
        selectedWorkshopId: 'NON_EXISTENT',
      })

      const next = useSensorStore.getState().getNextWorkshop()
      expect(['WS-001', 'WS-002']).toContain(next)
    })

    it('更新不存在的车间状态不应该出错', () => {
      expect(() => {
        useSensorStore.getState().updateWorkshopStatus({
          workshopId: 'NON_EXISTENT',
          workshopName: '测试车间',
          totalDevices: 10,
          activeAlarms: 0,
          activeWarnings: 0,
          alarmPercent: 0,
          isAnomaly: false,
          anomalyLevel: 'normal' as const,
          lastUpdate: new Date().toISOString(),
        })
      }).not.toThrow()

      expect(useSensorStore.getState().workshopStatuses.has('NON_EXISTENT')).toBe(true)
    })
  })

  describe('车间状态管理测试', () => {
    it('应该能够批量更新所有车间状态', () => {
      const statuses = [
        {
          workshopId: 'WS-001',
          workshopName: '一车间',
          totalDevices: 20,
          activeAlarms: 2,
          activeWarnings: 3,
          alarmPercent: 0.1,
          isAnomaly: false,
          anomalyLevel: 'attention' as const,
          lastUpdate: new Date().toISOString(),
        },
        {
          workshopId: 'WS-002',
          workshopName: '二车间',
          totalDevices: 15,
          activeAlarms: 5,
          activeWarnings: 2,
          alarmPercent: 0.33,
          isAnomaly: true,
          anomalyLevel: 'anomaly' as const,
          lastUpdate: new Date().toISOString(),
        },
      ]

      useSensorStore.getState().updateAllWorkshopStatuses(statuses)

      const state = useSensorStore.getState()
      expect(state.workshopStatuses.get('WS-001')?.totalDevices).toBe(20)
      expect(state.workshopStatuses.get('WS-002')?.isAnomaly).toBe(true)
    })

    it('应该能够获取指定车间的预警数量', () => {
      useSensorStore.setState({
        sensors: [
          { id: 'T001', type: 'temperature', workshopId: 'WS-001' } as any,
          { id: 'T002', type: 'temperature', workshopId: 'WS-001' } as any,
          { id: 'T003', type: 'temperature', workshopId: 'WS-002' } as any,
        ],
        predictions: new Map([
          ['T001', { sensorId: 'T001', isWarning: true } as any],
          ['T002', { sensorId: 'T002', isWarning: true } as any],
          ['T003', { sensorId: 'T003', isWarning: false } as any],
        ]),
      })

      const warningCount = useSensorStore.getState().getWarningCount('WS-001')
      expect(warningCount).toBe(2)
    })

    it('应该能够获取指定车间的所有预测', () => {
      useSensorStore.setState({
        sensors: [
          { id: 'T001', type: 'temperature', workshopId: 'WS-001' } as any,
          { id: 'T002', type: 'temperature', workshopId: 'WS-001' } as any,
          { id: 'T003', type: 'temperature', workshopId: 'WS-002' } as any,
        ],
        predictions: new Map([
          ['T001', { sensorId: 'T001', predictedValue: 65 } as any],
          ['T002', { sensorId: 'T002', predictedValue: 58 } as any],
        ]),
      })

      const predictions = useSensorStore.getState().getPredictionsForWorkshop('WS-001')
      expect(predictions.length).toBe(2)
      expect(predictions.every(p => p.sensorId.startsWith('T00'))).toBe(true)
    })
  })
})
