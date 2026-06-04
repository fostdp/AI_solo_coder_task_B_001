import { getSensorById, getSensorsByWorkshop, type SensorConfig } from '../../config/sensors.js'
import { getWorkshopById, type WorkshopConfig } from '../../config/workshops.js'
import { query } from '../db.js'

export interface ExportOptions {
  startTime: Date
  endTime: Date
  workshopIds?: string[]
  sensorTypes?: ('temperature' | 'wind' | 'solar' | 'vibration')[]
  sensorIds?: string[]
  includeAlarms?: boolean
  includePredictions?: boolean
  format: 'csv' | 'json'
}

export interface ExportResult {
  success: boolean
  filename: string
  data: string
  recordCount: number
  sizeBytes: number
  error?: string
}

interface SensorDataRow {
  time: string
  sensor_id: string
  sensor_type: string
  sensor_name: string
  workshop_id: string
  workshop_name: string
  line_id: string
  line_name: string
  value: number
  unit: string
  position_km: number
}

interface AlarmRow {
  time: string
  alarm_id: string
  sensor_id: string
  sensor_type: string
  workshop_id: string
  workshop_name: string
  alarm_type: string
  severity: string
  value: number
  threshold: number
  status: string
  message: string
}

export class DataExporter {
  private readonly sensorUnits: Record<string, string> = {
    temperature: '°C',
    wind: 'm/s',
    solar: 'W/m²',
    vibration: 'mm/s',
  }

  private readonly BATCH_SIZE = 1000

  public async exportSensorData(options: ExportOptions): Promise<ExportResult> {
    try {
      const sensorIds = this.getFilteredSensorIds(options)
      if (sensorIds.length === 0) {
        return {
          success: false,
          filename: '',
          data: '',
          recordCount: 0,
          sizeBytes: 0,
          error: '没有符合条件的传感器',
        }
      }

      const rows = await this.querySensorData(options, sensorIds)
      const csvContent = this.generateSensorCSV(rows)
      
      const filename = this.generateFilename('sensor_data', options)
      
      return {
        success: true,
        filename,
        data: csvContent,
        recordCount: rows.length,
        sizeBytes: Buffer.byteLength(csvContent, 'utf8'),
      }
    } catch (error) {
      return {
        success: false,
        filename: '',
        data: '',
        recordCount: 0,
        sizeBytes: 0,
        error: error instanceof Error ? error.message : '导出失败',
      }
    }
  }

  public async exportAlarmData(options: ExportOptions): Promise<ExportResult> {
    try {
      const workshopIds = options.workshopIds || this.getAllWorkshopIds()
      const rows = await this.queryAlarmData(options, workshopIds)
      const csvContent = this.generateAlarmCSV(rows)
      
      const filename = this.generateFilename('alarm_data', options)
      
      return {
        success: true,
        filename,
        data: csvContent,
        recordCount: rows.length,
        sizeBytes: Buffer.byteLength(csvContent, 'utf8'),
      }
    } catch (error) {
      return {
        success: false,
        filename: '',
        data: '',
        recordCount: 0,
        sizeBytes: 0,
        error: error instanceof Error ? error.message : '导出失败',
      }
    }
  }

  public async exportCombinedData(options: ExportOptions): Promise<ExportResult> {
    try {
      const sensorResult = await this.exportSensorData(options)
      const alarmResult = options.includeAlarms ? await this.exportAlarmData(options) : null

      let combinedData = ''
      let totalRecords = 0

      if (sensorResult.success) {
        combinedData += '=== 传感器数据 ===\n'
        combinedData += sensorResult.data
        combinedData += '\n\n'
        totalRecords += sensorResult.recordCount
      }

      if (alarmResult && alarmResult.success) {
        combinedData += '=== 告警数据 ===\n'
        combinedData += alarmResult.data
        totalRecords += alarmResult.recordCount
      }

      const filename = this.generateFilename('combined_data', options)

      return {
        success: true,
        filename,
        data: combinedData,
        recordCount: totalRecords,
        sizeBytes: Buffer.byteLength(combinedData, 'utf8'),
      }
    } catch (error) {
      return {
        success: false,
        filename: '',
        data: '',
        recordCount: 0,
        sizeBytes: 0,
        error: error instanceof Error ? error.message : '导出失败',
      }
    }
  }

  private getFilteredSensorIds(options: ExportOptions): string[] {
    let sensors: SensorConfig[] = []

    if (options.workshopIds && options.workshopIds.length > 0) {
      for (const workshopId of options.workshopIds) {
        sensors.push(...getSensorsByWorkshop(workshopId))
      }
    } else {
      sensors = this.getAllSensors()
    }

    if (options.sensorTypes && options.sensorTypes.length > 0) {
      sensors = sensors.filter(s => options.sensorTypes!.includes(s.type as any))
    }

    if (options.sensorIds && options.sensorIds.length > 0) {
      sensors = sensors.filter(s => options.sensorIds!.includes(s.id))
    }

    return sensors.map(s => s.id)
  }

  private async querySensorData(options: ExportOptions, sensorIds: string[]): Promise<SensorDataRow[]> {
    const allRows: SensorDataRow[] = []
    let cursorTime: Date | null = null
    let cursorSensorId: string | null = null

    while (true) {
      const placeholders = sensorIds.map((_, i) => `$${i + 3}`).join(',')
      let cursorCondition = ''
      const params: any[] = [options.startTime, options.endTime, ...sensorIds]

      if (cursorTime !== null && cursorSensorId !== null) {
        cursorCondition = `AND (time, sensor_id) > ($${params.length + 1}, $${params.length + 2})`
        params.push(cursorTime, cursorSensorId)
      }

      const sql = `
        SELECT 
          time,
          sensor_id,
          value
        FROM sensor_data
        WHERE 
          time >= $1 
          AND time <= $2
          AND sensor_id IN (${placeholders})
          ${cursorCondition}
        ORDER BY time ASC, sensor_id ASC
        LIMIT ${this.BATCH_SIZE}
      `

      const result = await query(sql, params)

      if (result.rows.length === 0) break

      for (const row of result.rows) {
        const sensor = getSensorById(row.sensor_id)
        const workshop = sensor ? getWorkshopById(sensor.workshopId) : null

        if (sensor && workshop) {
          allRows.push({
            time: row.time.toISOString(),
            sensor_id: row.sensor_id,
            sensor_type: sensor.type,
            sensor_name: this.getSensorName(sensor),
            workshop_id: workshop.id,
            workshop_name: workshop.name,
            line_id: sensor.lineId,
            line_name: sensor.lineName,
            value: Number(row.value),
            unit: this.sensorUnits[sensor.type] || '',
            position_km: sensor.linePositionKm,
          })
        }
        cursorTime = row.time
        cursorSensorId = row.sensor_id
      }

      if (result.rows.length < this.BATCH_SIZE) break

      await this.yieldToEventLoop()
    }

    return allRows
  }

  private async queryAlarmData(options: ExportOptions, workshopIds: string[]): Promise<AlarmRow[]> {
    const allRows: AlarmRow[] = []
    let cursorTime: Date | null = null
    let cursorId: string | null = null

    while (true) {
      let cursorCondition = ''
      const params: any[] = [options.startTime, options.endTime]

      if (cursorTime !== null && cursorId !== null) {
        cursorCondition = `AND (a.time, a.id) < ($${params.length + 1}, $${params.length + 2})`
        params.push(cursorTime, cursorId)
      }

      const sql = `
        SELECT 
          a.id,
          a.time,
          a.sensor_id,
          a.alarm_type,
          a.severity,
          a.value,
          a.threshold,
          a.status,
          a.message
        FROM alarms a
        WHERE 
          a.time >= $1 
          AND a.time <= $2
          ${cursorCondition}
        ORDER BY a.time DESC, a.id DESC
        LIMIT ${this.BATCH_SIZE}
      `

      const result = await query(sql, params)

      if (result.rows.length === 0) break

      for (const row of result.rows) {
        const sensor = getSensorById(row.sensor_id)
        const workshop = sensor ? getWorkshopById(sensor.workshopId) : null

        if (workshop && workshopIds.includes(workshop.id)) {
          allRows.push({
            time: row.time.toISOString(),
            alarm_id: row.id,
            sensor_id: row.sensor_id,
            sensor_type: sensor?.type || '',
            workshop_id: workshop.id,
            workshop_name: workshop.name,
            alarm_type: row.alarm_type,
            severity: row.severity,
            value: Number(row.value),
            threshold: Number(row.threshold),
            status: row.status,
            message: row.message,
          })
        }
        cursorTime = row.time
        cursorId = row.id
      }

      if (result.rows.length < this.BATCH_SIZE) break

      await this.yieldToEventLoop()
    }

    return allRows
  }

  private yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  private generateSensorCSV(rows: SensorDataRow[]): string {
    const headers = [
      '时间',
      '传感器ID',
      '传感器类型',
      '传感器名称',
      '车间ID',
      '车间名称',
      '线路ID',
      '线路名称',
      '数值',
      '单位',
      '位置(公里)',
    ]

    const csvLines = [headers.join(',')]

    for (const row of rows) {
      const values = [
        row.time,
        row.sensor_id,
        this.escapeCSV(row.sensor_type),
        this.escapeCSV(row.sensor_name),
        row.workshop_id,
        this.escapeCSV(row.workshop_name),
        row.line_id,
        this.escapeCSV(row.line_name),
        row.value.toFixed(2),
        row.unit,
        row.position_km.toFixed(1),
      ]
      csvLines.push(values.join(','))
    }

    return csvLines.join('\n')
  }

  private generateAlarmCSV(rows: AlarmRow[]): string {
    const headers = [
      '时间',
      '告警ID',
      '传感器ID',
      '传感器类型',
      '车间ID',
      '车间名称',
      '告警类型',
      '严重程度',
      '数值',
      '阈值',
      '状态',
      '消息',
    ]

    const csvLines = [headers.join(',')]

    for (const row of rows) {
      const values = [
        row.time,
        row.alarm_id,
        row.sensor_id,
        this.escapeCSV(row.sensor_type),
        row.workshop_id,
        this.escapeCSV(row.workshop_name),
        this.escapeCSV(row.alarm_type),
        this.escapeCSV(row.severity),
        row.value.toFixed(2),
        row.threshold.toFixed(2),
        this.escapeCSV(row.status),
        this.escapeCSV(row.message),
      ]
      csvLines.push(values.join(','))
    }

    return csvLines.join('\n')
  }

  private escapeCSV(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`
    }
    return value
  }

  private generateFilename(prefix: string, options: ExportOptions): string {
    const startStr = this.formatDateForFilename(options.startTime)
    const endStr = this.formatDateForFilename(options.endTime)
    return `${prefix}_${startStr}_to_${endStr}.csv`
  }

  private formatDateForFilename(date: Date): string {
    return date
      .toISOString()
      .replace(/[-:]/g, '')
      .replace('T', '_')
      .replace(/\.\d+Z$/, '')
  }

  private getAllSensors(): SensorConfig[] {
    const result: SensorConfig[] = []
    const workshopIds = this.getAllWorkshopIds()
    for (const workshopId of workshopIds) {
      result.push(...getSensorsByWorkshop(workshopId))
    }
    return result
  }

  private getAllWorkshopIds(): string[] {
    const ids: string[] = []
    for (let i = 1; i <= 3; i++) {
      const id = `WS-${String(i).padStart(3, '0')}`
      if (getWorkshopById(id)) {
        ids.push(id)
      }
    }
    return ids
  }

  private getSensorName(sensor: SensorConfig): string {
    const typeNames: Record<string, string> = {
      temperature: '温度',
      wind: '风速',
      solar: '日照',
      vibration: '振动',
    }
    return `${sensor.lineName} ${typeNames[sensor.type] || sensor.type} ${sensor.linePositionKm}km`
  }

  public validateExportOptions(options: Partial<ExportOptions>): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!options.startTime) {
      errors.push('缺少开始时间')
    }
    if (!options.endTime) {
      errors.push('缺少结束时间')
    }
    if (options.startTime && options.endTime && options.startTime >= options.endTime) {
      errors.push('开始时间必须早于结束时间')
    }

    const maxRange = 30 * 24 * 60 * 60 * 1000
    if (options.startTime && options.endTime) {
      const range = options.endTime.getTime() - options.startTime.getTime()
      if (range > maxRange) {
        errors.push('导出时间范围不能超过30天')
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }
}

export function createDataExporter(): DataExporter {
  return new DataExporter()
}
