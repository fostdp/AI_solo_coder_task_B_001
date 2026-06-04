import { createWriteStream, WriteStream } from 'fs'
import { unlink, stat, readFile } from 'fs/promises'
import { join } from 'path'
import { tmpdir } from 'os'
import { createHash } from 'crypto'
import { query } from '../db.js'
import { getSensorsByWorkshop, SENSORS } from '../../config/sensors.js'

export interface ExportOptions {
  startTime: Date
  endTime: Date
  workshopIds?: string[]
  sensorTypes?: ('temperature' | 'wind' | 'solar' | 'vibration')[]
  sensorIds?: string[]
  format: 'csv'
  includeAlarms?: boolean
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
}

export interface ExportResult {
  success: boolean
  filename: string
  filePath: string
  recordCount: number
  sizeBytes: number
  error?: string
}

interface QueryCursor {
  hasNext: () => boolean
  next: () => Promise<any[]>
  close: () => Promise<void>
}

const BATCH_SIZE = 1000
const MAX_EXPORT_DAYS = 30
const CSV_ESCAPE_REGEX = /[",\n\r]/

export class StreamingDataExporter {
  private tempFiles: Set<string> = new Set()

  public validateExportOptions(options: Partial<ExportOptions>): ValidationResult {
    const errors: string[] = []

    if (!options.startTime) {
      errors.push('缺少开始时间')
    }

    if (!options.endTime) {
      errors.push('缺少结束时间')
    }

    if (options.startTime && options.endTime) {
      if (options.startTime >= options.endTime) {
        errors.push('开始时间必须早于结束时间')
      }

      const rangeMs = options.endTime.getTime() - options.startTime.getTime()
      if (rangeMs > MAX_EXPORT_DAYS * 24 * 60 * 60 * 1000) {
        errors.push(`导出时间范围不能超过${MAX_EXPORT_DAYS}天`)
      }
    }

    if (options.workshopIds && options.workshopIds.length === 0) {
      errors.push('车间ID列表不能为空')
    }

    if (options.sensorIds && options.sensorIds.length === 0) {
      errors.push('传感器ID列表不能为空')
    }

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  private getFilteredSensorIds(options: ExportOptions): string[] {
    let sensors = SENSORS

    if (options.workshopIds && options.workshopIds.length > 0) {
      const workshopSensorIds = new Set<string>()
      for (const workshopId of options.workshopIds) {
        const workshopSensors = getSensorsByWorkshop(workshopId)
        workshopSensors.forEach(s => workshopSensorIds.add(s.id))
      }
      sensors = sensors.filter(s => workshopSensorIds.has(s.id))
    }

    if (options.sensorTypes && options.sensorTypes.length > 0) {
      sensors = sensors.filter(s => options.sensorTypes!.includes(s.type))
    }

    if (options.sensorIds && options.sensorIds.length > 0) {
      const idSet = new Set(options.sensorIds)
      sensors = sensors.filter(s => idSet.has(s.id))
    }

    return sensors.map(s => s.id)
  }

  private escapeCsvValue(value: any): string {
    if (value === null || value === undefined) {
      return ''
    }
    const str = String(value)
    if (CSV_ESCAPE_REGEX.test(str)) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  private async yieldToEventLoop(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0))
  }

  private createSensorDataCursor(sensorIds: string[], options: ExportOptions): QueryCursor {
    let offset = 0
    let finished = false

    return {
      hasNext: () => !finished,
      next: async (): Promise<any[]> => {
        if (finished || sensorIds.length === 0) {
          finished = true
          return []
        }

        const placeholders = sensorIds.map(() => '?').join(', ')
        const sql = `
          SELECT 
            sr.time,
            sr.sensor_id,
            sr.value,
            s.type as sensor_type,
            s.workshop_id
          FROM sensor_readings sr
          JOIN sensors s ON sr.sensor_id = s.id
          WHERE 
            sr.sensor_id IN (${placeholders})
            AND sr.time >= ?
            AND sr.time <= ?
          ORDER BY sr.time ASC
          LIMIT ? OFFSET ?
        `

        const params = [
          ...sensorIds,
          options.startTime.toISOString(),
          options.endTime.toISOString(),
          BATCH_SIZE,
          offset,
        ]

        const result = await query(sql, params)
        const rows = result.rows || []

        if (rows.length < BATCH_SIZE) {
          finished = true
        } else {
          offset += BATCH_SIZE
        }

        await this.yieldToEventLoop()
        return rows
      },
      close: async () => {
        finished = true
      },
    }
  }

  private createAlarmDataCursor(options: ExportOptions): QueryCursor {
    let offset = 0
    let finished = false

    return {
      hasNext: () => !finished,
      next: async (): Promise<any[]> => {
        if (finished) {
          finished = true
          return []
        }

        const sql = `
          SELECT 
            a.id,
            a.sensor_id,
            a.alarm_type,
            a.level,
            a.message,
            a.started_at,
            a.ended_at,
            a.is_active,
            s.workshop_id
          FROM alarms a
          LEFT JOIN sensors s ON a.sensor_id = s.id
          WHERE 
            a.started_at >= ?
            AND a.started_at <= ?
          ORDER BY a.started_at ASC
          LIMIT ? OFFSET ?
        `

        const params = [
          options.startTime.toISOString(),
          options.endTime.toISOString(),
          BATCH_SIZE,
          offset,
        ]

        const result = await query(sql, params)
        const rows = result.rows || []

        if (rows.length < BATCH_SIZE) {
          finished = true
        } else {
          offset += BATCH_SIZE
        }

        await this.yieldToEventLoop()
        return rows
      },
      close: async () => {
        finished = true
      },
    }
  }

  private generateTempFilename(prefix: string): string {
    const hash = createHash('md5')
      .update(Date.now().toString() + Math.random().toString())
      .digest('hex')
      .substring(0, 12)
    return `${prefix}_${hash}.csv`
  }

  private createCsvWriter(filename: string): {
    stream: WriteStream
    filePath: string
    writeLine: (values: any[]) => void
    end: () => Promise<void>
  } {
    const filePath = join(tmpdir(), filename)
    const stream = createWriteStream(filePath, { encoding: 'utf8' })

    this.tempFiles.add(filePath)

    const writeLine = (values: any[]) => {
      const line = values.map(v => this.escapeCsvValue(v)).join(',') + '\n'
      stream.write(line)
    }

    const end = (): Promise<void> => {
      return new Promise((resolve, reject) => {
        stream.end(() => {
          resolve()
        })
        stream.on('error', reject)
      })
    }

    return { stream, filePath, writeLine, end }
  }

  public async exportSensorData(options: ExportOptions): Promise<ExportResult> {
    const validation = this.validateExportOptions(options)
    if (!validation.valid) {
      return {
        success: false,
        filename: '',
        filePath: '',
        recordCount: 0,
        sizeBytes: 0,
        error: validation.errors.join(', '),
      }
    }

    const sensorIds = this.getFilteredSensorIds(options)
    if (sensorIds.length === 0) {
      return {
        success: false,
        filename: '',
        filePath: '',
        recordCount: 0,
        sizeBytes: 0,
        error: '没有符合条件的传感器',
      }
    }

    const filename = this.generateTempFilename('sensor_data')
    const { filePath, writeLine, end } = this.createCsvWriter(filename)

    writeLine(['时间', '传感器ID', '传感器类型', '车间ID', '数值'])

    let recordCount = 0
    const cursor = this.createSensorDataCursor(sensorIds, options)

    try {
      while (cursor.hasNext()) {
        const rows = await cursor.next()
        for (const row of rows) {
          writeLine([
            row.time,
            row.sensor_id,
            row.sensor_type,
            row.workshop_id,
            row.value,
          ])
          recordCount++
        }
      }
    } catch (error) {
      await cursor.close()
      await this.cleanupFile(filePath)
      return {
        success: false,
        filename,
        filePath,
        recordCount,
        sizeBytes: 0,
        error: error instanceof Error ? error.message : '导出失败',
      }
    }

    await end()

    const { size } = await stat(filePath)

    return {
      success: true,
      filename,
      filePath,
      recordCount,
      sizeBytes: size,
    }
  }

  public async exportAlarmData(options: ExportOptions): Promise<ExportResult> {
    const validation = this.validateExportOptions(options)
    if (!validation.valid) {
      return {
        success: false,
        filename: '',
        filePath: '',
        recordCount: 0,
        sizeBytes: 0,
        error: validation.errors.join(', '),
      }
    }

    const filename = this.generateTempFilename('alarm_data')
    const { filePath, writeLine, end } = this.createCsvWriter(filename)

    writeLine(['告警ID', '传感器ID', '告警类型', '级别', '消息', '开始时间', '结束时间', '是否活跃', '车间ID'])

    let recordCount = 0
    const cursor = this.createAlarmDataCursor(options)

    try {
      while (cursor.hasNext()) {
        const rows = await cursor.next()
        for (const row of rows) {
          writeLine([
            row.id,
            row.sensor_id,
            row.alarm_type,
            row.level,
            row.message,
            row.started_at,
            row.ended_at || '',
            row.is_active ? '是' : '否',
            row.workshop_id || '',
          ])
          recordCount++
        }
      }
    } catch (error) {
      await cursor.close()
      await this.cleanupFile(filePath)
      return {
        success: false,
        filename,
        filePath,
        recordCount,
        sizeBytes: 0,
        error: error instanceof Error ? error.message : '导出失败',
      }
    }

    await end()

    const { size } = await stat(filePath)

    return {
      success: true,
      filename,
      filePath,
      recordCount,
      sizeBytes: size,
    }
  }

  public async exportCombinedData(options: ExportOptions): Promise<ExportResult> {
    const validation = this.validateExportOptions(options)
    if (!validation.valid) {
      return {
        success: false,
        filename: '',
        filePath: '',
        recordCount: 0,
        sizeBytes: 0,
        error: validation.errors.join(', '),
      }
    }

    const filename = this.generateTempFilename('combined_data')
    const { filePath, writeLine, end } = this.createCsvWriter(filename)

    let totalRecords = 0

    writeLine(['=== 传感器数据 ==='])
    const sensorResult = await this.exportSensorData(options)
    if (sensorResult.success) {
      const content = await readFile(sensorResult.filePath, 'utf8')
      const lines = content.split('\n').slice(1)
      for (const line of lines) {
        if (line.trim()) {
          writeLine([line])
          totalRecords++
        }
      }
      await this.cleanupFile(sensorResult.filePath)
    }

    if (options.includeAlarms) {
      writeLine([])
      writeLine(['=== 告警数据 ==='])
      const alarmResult = await this.exportAlarmData(options)
      if (alarmResult.success) {
        const content = await readFile(alarmResult.filePath, 'utf8')
        const lines = content.split('\n').slice(1)
        for (const line of lines) {
          if (line.trim()) {
            writeLine([line])
            totalRecords++
          }
        }
        await this.cleanupFile(alarmResult.filePath)
      }
    }

    await end()

    const { size } = await stat(filePath)

    return {
      success: true,
      filename,
      filePath,
      recordCount: totalRecords,
      sizeBytes: size,
    }
  }

  private async cleanupFile(filePath: string): Promise<void> {
    try {
      await unlink(filePath)
      this.tempFiles.delete(filePath)
    } catch {
      // Ignore cleanup errors
    }
  }

  public async cleanup(): Promise<void> {
    const cleanupPromises = Array.from(this.tempFiles).map(fp => this.cleanupFile(fp))
    await Promise.allSettled(cleanupPromises)
  }
}

export function createStreamingDataExporter(): StreamingDataExporter {
  return new StreamingDataExporter()
}

export default StreamingDataExporter
