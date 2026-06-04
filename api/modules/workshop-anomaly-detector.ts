import { getSensorsByWorkshop, getSensorById } from '../../config/sensors.js'
import { getWorkshopById, WORKSHOP_THRESHOLD, type WorkshopConfig } from '../../config/workshops.js'

export type AnomalySeverity = 'warning' | 'critical' | 'info'
export type AnomalyType = 'mass_alarm' | 'correlated_failure' | 'environmental_trend'

export interface WorkshopAnomaly {
  id: string
  workshopId: string
  workshopName: string
  type: AnomalyType
  severity: AnomalySeverity
  alarmDeviceCount: number
  totalDeviceCount: number
  alarmDevicePercent: number
  affectedSensorIds: string[]
  description: string
  recommendations: string[]
  timestamp: Date
  isActive: boolean
  startTime: Date
  endTime?: Date
  durationMs?: number
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
  lastUpdate: Date
}

interface ActiveAlarm {
  sensorId: string
  alarmType: string
  startTime: Date
}

export class WorkshopAnomalyDetector {
  private activeAnomalies: Map<string, WorkshopAnomaly> = new Map()
  private anomalyHistory: WorkshopAnomaly[] = []
  private workshopStatuses: Map<string, WorkshopStatus> = new Map()
  private activeAlarmsByWorkshop: Map<string, Set<ActiveAlarm>> = new Map()
  private anomalyThreshold: number = WORKSHOP_THRESHOLD.anomalyDevicePercent
  private minAlarmDeviceCount: number = 5

  constructor() {
    this.initializeWorkshopStatuses()
  }

  private initializeWorkshopStatuses(): void {
    const workshops = this.getWorkshops()
    for (const workshop of workshops) {
      const sensors = getSensorsByWorkshop(workshop.id)
      this.workshopStatuses.set(workshop.id, {
        workshopId: workshop.id,
        workshopName: workshop.name,
        totalDevices: sensors.length,
        activeAlarms: 0,
        activeWarnings: 0,
        alarmPercent: 0,
        isAnomaly: false,
        anomalyLevel: 'normal',
        lastUpdate: new Date(),
      })
      this.activeAlarmsByWorkshop.set(workshop.id, new Set())
    }
  }

  public registerAlarm(sensorId: string, alarmType: string): void {
    const sensor = getSensorById(sensorId)
    if (!sensor) return

    const workshop = getWorkshopById(sensor.workshopId)
    if (!workshop) return

    const workshopAlarms = this.activeAlarmsByWorkshop.get(sensor.workshopId)
    if (!workshopAlarms) return

    const existingAlarm = Array.from(workshopAlarms).find(a => a.sensorId === sensorId && a.alarmType === alarmType)
    if (existingAlarm) return

    workshopAlarms.add({
      sensorId,
      alarmType,
      startTime: new Date(),
    })

    this.updateWorkshopStatus(sensor.workshopId)
    this.checkForAnomaly(sensor.workshopId)
  }

  public clearAlarm(sensorId: string, alarmType: string): void {
    const sensor = getSensorById(sensorId)
    if (!sensor) return

    const workshop = getWorkshopById(sensor.workshopId)
    if (!workshop) return

    const workshopAlarms = this.activeAlarmsByWorkshop.get(sensor.workshopId)
    if (!workshopAlarms) return

    const alarmToRemove = Array.from(workshopAlarms).find(
      a => a.sensorId === sensorId && a.alarmType === alarmType
    )
    if (alarmToRemove) {
      workshopAlarms.delete(alarmToRemove)
    }

    this.updateWorkshopStatus(sensor.workshopId)
    this.checkAnomalyRecovery(sensor.workshopId)
  }

  private updateWorkshopStatus(workshopId: string): void {
    const status = this.workshopStatuses.get(workshopId)
    const alarms = this.activeAlarmsByWorkshop.get(workshopId)
    const workshop = getWorkshopById(workshopId)
    
    if (!status || !alarms || !workshop) return

    const sensors = getSensorsByWorkshop(workshopId)
    const alarmCount = alarms.size
    const alarmPercent = sensors.length > 0 ? alarmCount / sensors.length : 0

    let anomalyLevel: 'normal' | 'attention' | 'anomaly' = 'normal'
    const isAnomaly = alarmPercent >= this.anomalyThreshold && alarmCount >= this.minAlarmDeviceCount
    if (isAnomaly) anomalyLevel = 'anomaly'
    else if (alarmPercent >= 0.15) anomalyLevel = 'attention'

    status.totalDevices = sensors.length
    status.activeAlarms = alarmCount
    status.activeWarnings = 0
    status.alarmPercent = alarmPercent
    status.isAnomaly = isAnomaly
    status.anomalyLevel = anomalyLevel
    status.lastUpdate = new Date()
  }

  private checkForAnomaly(workshopId: string): void {
    const status = this.workshopStatuses.get(workshopId)
    const workshop = getWorkshopById(workshopId)
    const alarms = this.activeAlarmsByWorkshop.get(workshopId)

    if (!status || !workshop || !alarms) return

    const existingAnomaly = this.activeAnomalies.get(workshopId)
    
    if (status.isAnomaly && !existingAnomaly) {
      const anomaly: WorkshopAnomaly = {
        id: `ANOM-${workshopId}-${Date.now()}`,
        workshopId,
        workshopName: workshop.name,
        type: 'mass_alarm',
        severity: status.alarmPercent >= 0.5 ? 'critical' : 'warning',
        alarmDeviceCount: status.activeAlarms,
        totalDeviceCount: status.totalDevices,
        alarmDevicePercent: status.alarmPercent,
        affectedSensorIds: Array.from(alarms).map(a => a.sensorId),
        description: `车间 ${workshop.name} ${status.activeAlarms}/${status.totalDevices} 台设备触发告警（${Math.round(status.alarmPercent * 100)}%），超过阈值 ${Math.round(this.anomalyThreshold * 100)}% 且绝对数量≥${this.minAlarmDeviceCount}，判定为车间级异常`,
        recommendations: this.generateRecommendations(status.alarmPercent, Array.from(alarms)),
        timestamp: new Date(),
        isActive: true,
        startTime: new Date(),
      }

      this.activeAnomalies.set(workshopId, anomaly)
      this.anomalyHistory.push(anomaly)
    } else if (existingAnomaly && status.isAnomaly) {
      existingAnomaly.alarmDeviceCount = status.activeAlarms
      existingAnomaly.alarmDevicePercent = status.alarmPercent
      existingAnomaly.affectedSensorIds = Array.from(alarms).map(a => a.sensorId)
      existingAnomaly.timestamp = new Date()
    }
  }

  private checkAnomalyRecovery(workshopId: string): void {
    const status = this.workshopStatuses.get(workshopId)
    const existingAnomaly = this.activeAnomalies.get(workshopId)

    if (!status || !existingAnomaly) return

    if (!status.isAnomaly) {
      const endTime = new Date()
      existingAnomaly.isActive = false
      existingAnomaly.endTime = endTime
      existingAnomaly.durationMs = endTime.getTime() - existingAnomaly.startTime.getTime()
      this.activeAnomalies.delete(workshopId)
    }
  }

  private generateRecommendations(alarmPercent: number, alarms: ActiveAlarm[]): string[] {
    const recommendations: string[] = []
    
    if (alarmPercent >= 0.5) {
      recommendations.push('立即启动应急预案，通知运维主管')
      recommendations.push('考虑对该车间进行隔离或降级运行')
    } else {
      recommendations.push('建议调度员关注该车间设备运行状态')
    }

    const alarmTypes = [...new Set(alarms.map(a => a.alarmType))]
    if (alarmTypes.includes('overheat')) {
      recommendations.push('建议检查环境冷却系统，温度异常设备较多')
    }
    if (alarmTypes.includes('galloping')) {
      recommendations.push('建议检查气象条件，风速异常可能与线路舞动相关')
    }

    recommendations.push('建议排查相关区域设备是否存在系统性问题')

    return recommendations
  }

  public getWorkshopStatus(workshopId: string): WorkshopStatus | undefined {
    return this.workshopStatuses.get(workshopId)
  }

  public getAllWorkshopStatuses(): WorkshopStatus[] {
    return Array.from(this.workshopStatuses.values())
  }

  public getActiveAnomalies(): WorkshopAnomaly[] {
    return Array.from(this.activeAnomalies.values())
  }

  public getAnomalyHistory(limit: number = 100): WorkshopAnomaly[] {
    return this.anomalyHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit)
  }

  public getWorkshopAnomaly(workshopId: string): WorkshopAnomaly | undefined {
    return this.activeAnomalies.get(workshopId)
  }

  public hasActiveAnomaly(workshopId: string): boolean {
    return this.activeAnomalies.has(workshopId)
  }

  public getHighPriorityWorkshops(): string[] {
    return Array.from(this.activeAnomalies.values())
      .filter(a => a.severity === 'critical')
      .map(a => a.workshopId)
  }

  public getWorkshopsWithAlarms(): string[] {
    const result: string[] = []
    for (const [workshopId, alarms] of this.activeAlarmsByWorkshop.entries()) {
      if (alarms.size > 0) {
        result.push(workshopId)
      }
    }
    return result
  }

  private getWorkshops(): WorkshopConfig[] {
    const result: WorkshopConfig[] = []
    const workshopIds = new Set<string>()
    
    for (let i = 1; i <= 3; i++) {
      const ws = getWorkshopById(`WS-${String(i).padStart(3, '0')}`)
      if (ws) result.push(ws)
    }
    
    return result
  }

  public setAnomalyThreshold(percent: number): void {
    this.anomalyThreshold = Math.max(0.1, Math.min(1.0, percent))
  }

  public getAnomalyThreshold(): number {
    return this.anomalyThreshold
  }

  public setMinAlarmDeviceCount(count: number): void {
    this.minAlarmDeviceCount = Math.max(1, Math.min(count, 1000))
  }

  public getMinAlarmDeviceCount(): number {
    return this.minAlarmDeviceCount
  }

  public clearAll(): void {
    this.activeAnomalies.clear()
    this.activeAlarmsByWorkshop.clear()
    this.anomalyHistory = []
    this.initializeWorkshopStatuses()
  }

  public getStatistics(): {
    totalWorkshops: number
    workshopsWithAlarms: number
    activeAnomalies: number
    criticalAnomalies: number
  } {
    return {
      totalWorkshops: this.workshopStatuses.size,
      workshopsWithAlarms: this.getWorkshopsWithAlarms().length,
      activeAnomalies: this.activeAnomalies.size,
      criticalAnomalies: Array.from(this.activeAnomalies.values()).filter(a => a.severity === 'critical').length,
    }
  }
}

export function createWorkshopAnomalyDetector(): WorkshopAnomalyDetector {
  return new WorkshopAnomalyDetector()
}
