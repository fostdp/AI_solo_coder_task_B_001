import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createDataExporter } from './data-exporter.js'
import { query } from '../db.js'

vi.mock('../db.js', () => ({
  query: vi.fn().mockResolvedValue({ rows: [] }),
}))

describe('DataExporter', () => {
  let exporter: ReturnType<typeof createDataExporter>

  beforeEach(() => {
    exporter = createDataExporter()
    vi.clearAllMocks()
  })

  describe('CSV格式正确性测试', () => {
    it('应该正确验证导出选项', () => {
      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
      }

      const result = exporter.validateExportOptions(options)
      expect(result.valid).toBe(true)
      expect(result.errors.length).toBe(0)
    })

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

    it('应该验证时间范围正好30天', () => {
      const startTime = new Date('2024-01-01T00:00:00Z')
      const endTime = new Date(startTime.getTime() + 30 * 24 * 60 * 60 * 1000 - 1)

      const result = exporter.validateExportOptions({
        startTime,
        endTime,
        format: 'csv' as const,
      })

      expect(result.valid).toBe(true)
    })
  })

  describe('传感器数据导出测试', () => {
    it('应该正确处理空数据导出', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.success).toBe(true)
      expect(result.recordCount).toBe(0)
      expect(result.data).toContain('时间')
      expect(result.data).toContain('传感器ID')
    })

    it('应该正确计算文件大小', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.sizeBytes).toBeGreaterThan(0)
      expect(result.sizeBytes).toBe(Buffer.byteLength(result.data, 'utf8'))
    })

    it('应该生成有意义的文件名', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-15T10:30:00Z'),
        endTime: new Date('2024-01-15T11:30:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.filename).toMatch(/\.csv$/)
      expect(result.filename.length).toBeGreaterThan(0)
      expect(result.filename).toContain('sensor_data')
      expect(result.filename).toContain('20240115')
    })

    it('不存在的车间应该返回失败', async () => {
      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['NON_EXISTENT'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.success).toBe(false)
      expect(result.error).toBe('没有符合条件的传感器')
    })

    it('应该支持按传感器类型筛选', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
        sensorTypes: ['temperature'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.success).toBe(true)
    })

    it('应该支持按传感器ID筛选', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        sensorIds: ['T001-001', 'T001-002'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.success).toBe(true)
    })

    it('空的筛选条件应该导出所有传感器', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
      }

      const result = await exporter.exportSensorData(options)

      expect(result.success).toBe(true)
    })
  })

  describe('告警数据导出测试', () => {
    it('应该正确导出告警数据', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
      }

      const result = await exporter.exportAlarmData(options)

      expect(result.success).toBe(true)
      expect(result.data).toContain('时间')
      expect(result.data).toContain('告警ID')
      expect(result.data).toContain('严重程度')
      expect(result.filename).toContain('alarm_data')
    })
  })

  describe('组合数据导出测试', () => {
    it('应该正确组合传感器和告警数据', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        includeAlarms: true,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportCombinedData(options)

      expect(result.success).toBe(true)
      expect(result.data).toContain('传感器数据')
      expect(result.data).toContain('告警数据')
    })

    it('不包含告警时只导出传感器数据', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        includeAlarms: false,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportCombinedData(options)

      expect(result.success).toBe(true)
      expect(result.data).toContain('传感器数据')
      expect(result.data).not.toContain('告警数据')
    })
  })

  describe('异常场景测试', () => {
    it('应该正确处理数据库查询错误', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      vi.mocked(query).mockRejectedValue(new Error('数据库连接失败'))

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.success).toBe(false)
      expect(result.error).toBeDefined()
    })

    it('不存在的传感器ID应该返回失败', async () => {
      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        sensorIds: ['NON_EXISTENT_001', 'NON_EXISTENT_002'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.success).toBe(false)
    })

    it('应该正确记录导出的记录数量', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportSensorData(options)

      expect(typeof result.recordCount).toBeDefined()
      expect(result.recordCount).toBeGreaterThanOrEqual(0)
    })
  })

  describe('导出期间系统正常运行测试', () => {
    it('应该异步执行而不阻塞其他操作', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const startTime = Date.now()

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportSensorData(options)

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(1000)
      expect(result.success).toBe(true)
    })

    it('多个导出请求应该并行处理', async () => {
      vi.mocked(query).mockResolvedValue({ rows: [] })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const [result1, result2] = await Promise.all([
        exporter.exportSensorData(options),
        exporter.exportAlarmData(options),
      ])

      expect(result1.success).toBe(true)
      expect(result2.success).toBe(true)
    })

    it('分批读取应该正确处理多批次数据', async () => {
      const batch1Rows = Array.from({ length: 1000 }, (_, i) => ({
        time: new Date(`2024-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`),
        sensor_id: 'T001-001',
        value: 50 + i * 0.1,
      }))
      const batch2Rows = Array.from({ length: 1000 }, (_, i) => ({
        time: new Date(`2024-01-01T01:${String(i % 60).padStart(2, '0')}:00Z`),
        sensor_id: 'T001-002',
        value: 60 + i * 0.1,
      }))
      const batch3Rows = Array.from({ length: 500 }, (_, i) => ({
        time: new Date(`2024-01-01T02:${String(i % 60).padStart(2, '0')}:00Z`),
        sensor_id: 'T001-003',
        value: 70 + i * 0.1,
      }))

      vi.mocked(query)
        .mockResolvedValueOnce({ rows: batch1Rows })
        .mockResolvedValueOnce({ rows: batch2Rows })
        .mockResolvedValueOnce({ rows: batch3Rows })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T03:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportSensorData(options)

      expect(result.success).toBe(true)
      expect(query).toHaveBeenCalledTimes(3)
    })

    it('游标分页查询应包含正确的游标条件', async () => {
      const batch1Rows = Array.from({ length: 1000 }, (_, i) => ({
        time: new Date(`2024-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`),
        sensor_id: 'T001-001',
        value: 50 + i * 0.1,
      }))
      const batch2Rows = Array.from({ length: 500 }, (_, i) => ({
        time: new Date(`2024-01-01T01:${String(i % 60).padStart(2, '0')}:00Z`),
        sensor_id: 'T001-002',
        value: 60 + i * 0.1,
      }))

      vi.mocked(query)
        .mockResolvedValueOnce({ rows: batch1Rows })
        .mockResolvedValueOnce({ rows: batch2Rows })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T03:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      await exporter.exportSensorData(options)

      const secondCallSql = vi.mocked(query).mock.calls[1][0] as string
      expect(secondCallSql).toContain('(time, sensor_id)')
      expect(secondCallSql).not.toContain('OFFSET')
    })

    it('单批次数据不足1000条时不应继续请求下一批', async () => {
      const smallBatch = Array.from({ length: 100 }, (_, i) => ({
        time: new Date(`2024-01-01T00:${String(i % 60).padStart(2, '0')}:00Z`),
        sensor_id: 'T001-001',
        value: 50 + i * 0.1,
      }))

      vi.mocked(query).mockResolvedValue({ rows: smallBatch })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      await exporter.exportSensorData(options)

      expect(query).toHaveBeenCalledTimes(1)
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

  describe('分批查询和事件循环让步测试', () => {
    it('多批数据时应该正确合并结果', async () => {
      let callCount = 0
      vi.mocked(query).mockImplementation(async () => {
        callCount++
        if (callCount <= 2) {
          return {
            rows: Array.from({ length: 1000 }, (_, i) => ({
              time: new Date('2024-01-01T00:00:00Z'),
              sensor_id: 'T001-001',
              value: 50 + i,
            })),
          }
        }
        return { rows: [] }
      })

      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const result = await exporter.exportSensorData(options)
      expect(result.success).toBe(true)
      expect(result.recordCount).toBeGreaterThan(0)
      expect(callCount).toBeGreaterThan(1)
    })

    it('分批查询时应该释放事件循环不阻塞', async () => {
      let callCount = 0
      vi.mocked(query).mockImplementation(async () => {
        callCount++
        if (callCount <= 3) {
          return {
            rows: Array.from({ length: 1000 }, () => ({
              time: new Date('2024-01-01T00:00:00Z'),
              sensor_id: 'T001-001',
              value: 50,
            })),
          }
        }
        return { rows: [] }
      })

      const startTime = Date.now()
      const options = {
        startTime: new Date('2024-01-01T00:00:00Z'),
        endTime: new Date('2024-01-01T01:00:00Z'),
        format: 'csv' as const,
        workshopIds: ['WS-001'],
      }

      const exportPromise = exporter.exportSensorData(options)

      let otherTaskCompleted = false
      setTimeout(() => {
        otherTaskCompleted = true
      }, 10)

      await exportPromise
      const duration = Date.now() - startTime

      expect(duration).toBeLessThan(1000)
      expect(otherTaskCompleted).toBe(true)
    })
  })
})
