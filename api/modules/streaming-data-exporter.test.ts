import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { createWriteStream } from 'fs'
import { unlink, stat, readFile } from 'fs/promises'
import { StreamingDataExporter, createStreamingDataExporter } from './streaming-data-exporter.js'
import { query } from '../db.js'

vi.mock('../db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}))

vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs')>()
  return {
    ...actual,
    createWriteStream: vi.fn(() => ({
      write: vi.fn().mockReturnValue(true),
      end: vi.fn((cb) => cb?.()),
      on: vi.fn(),
    })),
  }
})

vi.mock('fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fs/promises')>()
  return {
    ...actual,
    unlink: vi.fn().mockResolvedValue(undefined),
    stat: vi.fn().mockResolvedValue({ size: 1000 }),
    readFile: vi.fn().mockResolvedValue('test,data\n1,2\n'),
  }
})

describe('StreamingDataExporter', () => {
  let exporter: StreamingDataExporter

  beforeEach(() => {
    exporter = createStreamingDataExporter()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await exporter.cleanup()
  })

  describe('基本功能测试', () => {
    it('应该能够创建流式导出器实例', () => {
      expect(exporter).toBeInstanceOf(StreamingDataExporter)
    })

    it('应该能够验证导出选项', () => {
      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
      }

      const result = exporter.validateExportOptions(options)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })
  })

  describe('选项验证测试', () => {
    it('应该验证开始时间不能为空', () => {
      const result = exporter.validateExportOptions({
        endTime: new Date(),
        format: 'csv' as const,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('缺少开始时间')
    })

    it('应该验证结束时间不能为空', () => {
      const result = exporter.validateExportOptions({
        startTime: new Date(),
        format: 'csv' as const,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('缺少结束时间')
    })

    it('应该验证开始时间必须早于结束时间', () => {
      const startTime = new Date('2024-01-02T00:00:00Z')
      const endTime = new Date('2024-01-01T00:00:00Z')

      const result = exporter.validateExportOptions({
        startTime,
        endTime,
        format: 'csv' as const,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('开始时间必须早于结束时间')
    })

    it('应该验证时间范围不能超过30天', () => {
      const startTime = new Date('2024-01-01T00:00:00Z')
      const endTime = new Date(startTime.getTime() + 31 * 24 * 60 * 60 * 1000)

      const result = exporter.validateExportOptions({
        startTime,
        endTime,
        format: 'csv' as const,
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('导出时间范围不能超过30天')
    })

    it('时间范围正好30天应该通过验证', () => {
      const startTime = new Date('2024-01-01T00:00:00Z')
      const endTime = new Date(startTime.getTime() + 30 * 24 * 60 * 60 * 1000 - 1)

      const result = exporter.validateExportOptions({
        startTime,
        endTime,
        format: 'csv' as const,
      })

      expect(result.valid).toBe(true)
    })

    it('空的车间ID列表应该报错', () => {
      const result = exporter.validateExportOptions({
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        format: 'csv' as const,
        workshopIds: [],
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('车间ID列表不能为空')
    })

    it('空的传感器ID列表应该报错', () => {
      const result = exporter.validateExportOptions({
        startTime: new Date(),
        endTime: new Date(Date.now() + 3600000),
        format: 'csv' as const,
        sensorIds: [],
      })

      expect(result.valid).toBe(false)
      expect(result.errors).toContain('传感器ID列表不能为空')
    })
  })

  describe('CSV转义测试', () => {
    it('应该正确转义包含逗号的值', async () => {
      const exporterAny = exporter as any
      const result = exporterAny.escapeCsvValue('value,with,commas')
      expect(result).toBe('"value,with,commas"')
    })

    it('应该正确转义包含引号的值', async () => {
      const exporterAny = exporter as any
      const result = exporterAny.escapeCsvValue('value"with"quotes')
      expect(result).toBe('"value""with""quotes"')
    })

    it('应该正确转义包含换行符的值', async () => {
      const exporterAny = exporter as any
      const result = exporterAny.escapeCsvValue('value\nwith\nnewlines')
      expect(result).toBe('"value\nwith\nnewlines"')
    })

    it('null和undefined应该转换为空字符串', async () => {
      const exporterAny = exporter as any
      expect(exporterAny.escapeCsvValue(null)).toBe('')
      expect(exporterAny.escapeCsvValue(undefined)).toBe('')
    })

    it('普通值不应该被转义', async () => {
      const exporterAny = exporter as any
      expect(exporterAny.escapeCsvValue('normal value')).toBe('normal value')
      expect(exporterAny.escapeCsvValue(123)).toBe('123')
    })
  })

  describe('传感器数据导出测试', () => {
    it('无效选项应该返回失败', async () => {
      const result = await exporter.exportSensorData({
        startTime: new Date(),
        endTime: new Date(Date.now() - 3600000),
        format: 'csv' as const,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('没有符合条件的传感器应该返回失败', async () => {
      const result = await exporter.exportSensorData({
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        sensorIds: ['NON_EXISTENT_001', 'NON_EXISTENT_002'],
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('没有符合条件的传感器')
    })

    it('数据库错误应该被捕获并返回失败', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(query).mockRejectedValue(new Error('DB Error'))

      const result = await exporter.exportSensorData({
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      })

      expect(result.success).toBe(false)
      expect(result.error).toBe('DB Error')
    })
  })

  describe('告警数据导出测试', () => {
    it('无效选项应该返回失败', async () => {
      const result = await exporter.exportAlarmData({
        startTime: new Date(),
        endTime: new Date(Date.now() - 3600000),
        format: 'csv' as const,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('应该生成有意义的文件名', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const result = await exporter.exportAlarmData({
        startTime: new Date('2024-01-15T10:30:00Z'),
        endTime: new Date('2024-01-15T11:30:00Z'),
        format: 'csv' as const,
      })

      expect(result.filename).toMatch(/\.csv$/)
      expect(result.filename.length).toBeGreaterThan(0)
      expect(result.filename).toContain('alarm_data')
    })
  })

  describe('组合数据导出测试', () => {
    it('无效选项应该返回失败', async () => {
      const result = await exporter.exportCombinedData({
        startTime: new Date(),
        endTime: new Date(Date.now() - 3600000),
        format: 'csv' as const,
      })

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('包含告警时应该导出传感器和告警数据', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })
      vi.mocked(readFile).mockResolvedValue('header\nvalue1\nvalue2\n')

      const result = await exporter.exportCombinedData({
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        includeAlarms: true,
        workshopIds: ['WS-001'],
      })

      expect(result.success).toBe(true)
      expect(result.filename).toContain('combined_data')
    })

    it('不包含告警时只导出传感器数据', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })
      vi.mocked(readFile).mockResolvedValue('header\nvalue1\nvalue2\n')

      const result = await exporter.exportCombinedData({
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        includeAlarms: false,
        workshopIds: ['WS-001'],
      })

      expect(result.success).toBe(true)
    })
  })

  describe('临时文件清理测试', () => {
    it('cleanup方法应该清理所有临时文件', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })
      vi.mocked(readFile).mockResolvedValue('header\nvalue1\nvalue2\n')

      await exporter.exportSensorData({
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      })

      await exporter.cleanup()

      expect(unlink).toHaveBeenCalled()
    })
  })

  describe('边界条件测试', () => {
    it('时间范围为1毫秒应该正常导出', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const startTime = new Date('2024-01-01T00:00:00Z')
      const endTime = new Date(startTime.getTime() + 1)

      const result = await exporter.exportSensorData({
        startTime,
        endTime,
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      })

      expect(result.success).toBe(true)
    })

    it('时间范围为30天应该正常导出', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const startTime = new Date('2024-01-01T00:00:00Z')
      const endTime = new Date(startTime.getTime() + 30 * 24 * 60 * 60 * 1000 - 1)

      const result = await exporter.exportSensorData({
        startTime,
        endTime,
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      })

      expect(result.success).toBe(true)
    })
  })

  describe('事件循环让步测试', () => {
    it('导出过程应该调用yieldToEventLoop', async () => {
      let callCount = 0
      const originalSetTimeout = global.setTimeout
      vi.spyOn(global, 'setTimeout').mockImplementation((...args: any[]) => {
        if (args[1] === 0) callCount++
        return originalSetTimeout.apply(global, args as any)
      })

      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      await exporter.exportSensorData(options)

      expect(callCount).toBeGreaterThan(0)
      vi.restoreAllMocks()
    })
  })
})
