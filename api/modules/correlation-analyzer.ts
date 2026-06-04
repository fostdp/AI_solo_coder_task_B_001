import { getSensorsByWorkshop } from '../../config/sensors.js'

export interface WorkshopAnomaly {
  id: string
  workshopId: string
  workshopName: string
  type: string
  severity: 'warning' | 'critical' | 'info'
  alarmDeviceCount: number
  totalDeviceCount: number
  alarmDevicePercent: number
  affectedSensorIds: string[]
  description: string
  recommendations: string[]
  timestamp: string
  isActive: boolean
  startTime: string
}

export interface WorkshopStatus {
  workshopId: string
  workshopName: string
  totalDevices: number
  activeAlarms: number
  activeWarnings: number
  alarmPercent: number
  isAnomaly: boolean
  anomalyLevel: 'normal' | 'attention' | 'anomaly'
  lastUpdate: string
}

interface WorkshopState {
  alarms: Map<string, Set<string>>
  anomaly: WorkshopAnomaly | null
  lastUpdate: Date
}

export interface CorrelationAnalyzerConfig {
  anomalyThreshold: number
  minAlarmDeviceCount: number
  warningThreshold: number
  criticalThreshold: number
}

export class CorrelationAnalyzer {
  private workshopStates: Map<string, WorkshopState> = new Map()
  private config: CorrelationAnalyzerConfig

  constructor(config: Partial<CorrelationAnalyzerConfig> = {}) {
    this.config = {
      anomalyThreshold: config.anomalyThreshold ?? 0.3,
      minAlarmDeviceCount: config.minAlarmDeviceCount ?? 5,
      warningThreshold: config.warningThreshold ?? 0.5,
      criticalThreshold: config.criticalThreshold ?? 0.7,
    }
  }

  public registerAlarm(sensorId: string, alarmType: string): void {
    const workshopId = this.getWorkshopIdBySensor(sensorId)
    if (!workshopId) return

    if (!this.workshopStates.has(workshopId)) {
      this.workshopStates.set(workshopId, this.createEmptyWorkshopState())
    }

    const state = this.workshopStates.get(workshopId)!
    if (!state.alarms.has(sensorId)) {
      state.alarms.set(sensorId, new Set())
    }
    state.alarms.get(sensorId)!.add(alarmType)
    state.lastUpdate = new Date()

    this.evaluateAnomaly(workshopId)
  }

  public clearAlarm(sensorId: string, alarmType: string): void {
    const workshopId = this.getWorkshopIdBySensor(sensorId)
    if (!workshopId) return

    const state = this.workshopStates.get(workshopId)
    if (!state) return

    const sensorAlarms = state.alarms.get(sensorId)
    if (sensorAlarms) {
      sensorAlarms.delete(alarmType)
      if (sensorAlarms.size === 0) {
        state.alarms.delete(sensorId)
      }
    }
    state.lastUpdate = new Date()

    this.evaluateAnomaly(workshopId)
  }

  public clearAllAlarmsForWorkshop(workshopId: string): void {
    const state = this.workshopStates.get(workshopId)
    if (state) {
      state.alarms.clear()
      state.anomaly = null
      state.lastUpdate = new Date()
    }
  }

  public clearAll(): void {
    this.workshopStates.clear()
  }

  public getWorkshopStatus(workshopId: string): WorkshopStatus | null {
    const sensors = getSensorsByWorkshop(workshopId)
    if (sensors.length === 0) return null

    const state = this.workshopStates.get(workshopId)
    const alarmCount = state ? state.alarms.size : 0
    const alarmPercent = sensors.length > 0 ? alarmCount / sensors.length : 0

    let anomalyLevel: 'normal' | 'attention' | 'anomaly' = 'normal'
    if (alarmPercent >= this.config.anomalyThreshold && alarmCount >= this.config.minAlarmDeviceCount) {
      anomalyLevel = 'anomaly'
    } else if (alarmPercent >= this.config.anomalyThreshold * 0.5) {
      anomalyLevel = 'attention'
    }

    return {
      workshopId,
      workshopName: this.getWorkshopName(workshopId),
      totalDevices: sensors.length,
      activeAlarms: alarmCount,
      activeWarnings: 0,
      alarmPercent,
      isAnomaly: anomalyLevel === 'anomaly',
      anomalyLevel,
      lastUpdate: (state?.lastUpdate || new Date()).toISOString(),
    }
  }

  public getAllWorkshopStatuses(): WorkshopStatus[] {
    const workshopIds = new Set<string>()
    for (const state of this.workshopStates.keys()) {
      workshopIds.add(state)
    }

    for (const sensor of getSensorsByWorkshop('WS-001')) {
      workshopIds.add(sensor.workshopId)
    }

    const statuses: WorkshopStatus[] = []
    for (const workshopId of workshopIds) {
      const status = this.getWorkshopStatus(workshopId)
      if (status) {
        statuses.push(status)
      }
    }
    return statuses
  }

  public getWorkshopAnomaly(workshopId: string): WorkshopAnomaly | null {
    const state = this.workshopStates.get(workshopId)
    return state?.anomaly || null
  }

  public getAllWorkshopAnomalies(): WorkshopAnomaly[] {
    const anomalies: WorkshopAnomaly[] = []
    for (const state of this.workshopStates.values()) {
      if (state.anomaly && state.anomaly.isActive) {
        anomalies.push(state.anomaly)
      }
    }
    return anomalies
  }

  public hasActiveAnomaly(workshopId: string): boolean {
    const state = this.workshopStates.get(workshopId)
    return state?.anomaly?.isActive || false
  }

  private evaluateAnomaly(workshopId: string): void {
    const state = this.workshopStates.get(workshopId)
    if (!state) return

    const sensors = getSensorsByWorkshop(workshopId)
    const totalDevices = sensors.length
    const alarmCount = state.alarms.size
    const alarmPercent = totalDevices > 0 ? alarmCount / totalDevices : 0

    const isAnomaly = alarmPercent >= this.config.anomalyThreshold && alarmCount >= this.config.minAlarmDeviceCount

    if (isAnomaly && !state.anomaly?.isActive) {
      state.anomaly = this.createAnomaly(workshopId, alarmCount, totalDevices, alarmPercent, Array.from(state.alarms.keys()))
    } else if (!isAnomaly && state.anomaly?.isActive) {
      state.anomaly = {
        ...state.anomaly,
        isActive: false,
        timestamp: new Date().toISOString(),
      }
    } else if (state.anomaly?.isActive) {
      state.anomaly = {
        ...state.anomaly,
        alarmDeviceCount: alarmCount,
        alarmDevicePercent: alarmPercent,
        affectedSensorIds: Array.from(state.alarms.keys()),
        timestamp: new Date().toISOString(),
      }
    }
  }

  private createAnomaly(
    workshopId: string,
    alarmCount: number,
    totalDevices: number,
    alarmPercent: number,
    affectedSensorIds: string[],
  ): WorkshopAnomaly {
    const severity = alarmPercent >= this.config.criticalThreshold
      ? 'critical'
      : alarmPercent >= this.config.warningThreshold
      ? 'warning'
      : 'info'

    const recommendations = this.generateRecommendations(workshopId, alarmPercent, affectedSensorIds)

    return {
      id: `ANOM-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      workshopId,
      workshopName: this.getWorkshopName(workshopId),
      type: 'mass_alarm',
      severity,
      alarmDeviceCount: alarmCount,
      totalDeviceCount: totalDevices,
      alarmDevicePercent: alarmPercent,
      affectedSensorIds,
      description: `车间告警设备比例达到${(alarmPercent * 100).toFixed(1)}%（${alarmCount}/${totalDevices}），触发车间级异常（比例≥${this.config.anomalyThreshold * 100}%且绝对数量≥${this.config.minAlarmDeviceCount}台）`,
      recommendations,
      timestamp: new Date().toISOString(),
      isActive: true,
      startTime: new Date().toISOString(),
    }
  }

  private generateRecommendations(workshopId: string, alarmPercent: number, affectedSensorIds: string[]): string[] {
    const recommendations: string[] = []

    if (alarmPercent >= this.config.criticalThreshold) {
      recommendations.push('立即启动应急预案，安排运维人员现场检查')
      recommendations.push('考虑降低相关生产线运行负荷')
    } else if (alarmPercent >= this.config.warningThreshold) {
      recommendations.push('安排运维人员优先检查受影响设备')
      recommendations.push('密切监控告警扩散趋势')
    }

    const hasOverheat = affectedSensorIds.some(id => id.startsWith('T0'))
    if (hasOverheat) {
      recommendations.push('检查冷却系统运行状态')
      recommendations.push('验证环境温度控制是否正常')
    }

    recommendations.push('确认相关设备的维护计划执行情况')
    recommendations.push('评估是否需要调整设备运行参数')

    return recommendations
  }

  private getWorkshopIdBySensor(sensorId: string): string | null {
    if (sensorId.startsWith('T001') || sensorId.startsWith('V001')) return 'WS-001'
    if (sensorId.startsWith('T002') || sensorId.startsWith('V002')) return 'WS-002'
    if (sensorId.startsWith('T003') || sensorId.startsWith('V003')) return 'WS-003'
    return null
  }

  private getWorkshopName(workshopId: string): string {
    const names: Record<string, string> = {
      'WS-001': '一车间',
      'WS-002': '二车间',
      'WS-003': '三车间',
    }
    return names[workshopId] || workshopId
  }

  private createEmptyWorkshopState(): WorkshopState {
    return {
      alarms: new Map(),
      anomaly: null,
      lastUpdate: new Date(),
    }
  }

  public setAnomalyThreshold(threshold: number): void {
    this.config.anomalyThreshold = Math.max(0.1, Math.min(1.0, threshold))
  }

  public setMinAlarmDeviceCount(count: number): void {
    this.config.minAlarmDeviceCount = Math.max(1, count)
  }

  public setWarningThreshold(threshold: number): void {
    this.config.warningThreshold = Math.max(0.1, Math.min(0.9, threshold))
  }

  public setCriticalThreshold(threshold: number): void {
    this.config.criticalThreshold = Math.max(0.2, Math.min(1.0, threshold))
  }

  public getConfig(): CorrelationAnalyzerConfig {
    return { ...this.config }
  }

  public getAlarmCount(workshopId: string): number {
    const state = this.workshopStates.get(workshopId)
    return state?.alarms.size || 0
  }
}

export function createCorrelationAnalyzer(config?: Partial<CorrelationAnalyzerConfig>): CorrelationAnalyzer {
  return new CorrelationAnalyzer(config)
}
