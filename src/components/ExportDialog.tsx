import { useState, useCallback } from 'react'
import { useSensorStore } from '../store/index.js'
import { useWebSocket } from '../hooks/useWebSocket.js'

interface ExportDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function ExportDialog({ isOpen, onClose }: ExportDialogProps) {
  const { workshops, selectedWorkshopId } = useSensorStore()
  const { requestExport } = useWebSocket()

  const [exportType, setExportType] = useState<'sensor' | 'alarm' | 'combined'>('sensor')
  const [timeRange, setTimeRange] = useState<'1h' | '6h' | '24h' | '7d'>('1h')
  const [selectedWorkshops, setSelectedWorkshops] = useState<string[]>([selectedWorkshopId])
  const [selectedTypes, setSelectedTypes] = useState<string[]>(['temperature', 'wind', 'solar', 'vibration'])
  const [isExporting, setIsExporting] = useState(false)

  const getTimeRangeDates = useCallback(() => {
    const end = new Date()
    const start = new Date()

    switch (timeRange) {
      case '1h':
        start.setHours(start.getHours() - 1)
        break
      case '6h':
        start.setHours(start.getHours() - 6)
        break
      case '24h':
        start.setHours(start.getHours() - 24)
        break
      case '7d':
        start.setDate(start.getDate() - 7)
        break
    }

    return { start, end }
  }, [timeRange])

  const handleExport = useCallback(async () => {
    setIsExporting(true)
    try {
      const { start, end } = getTimeRangeDates()
      await requestExport({
        exportType,
        startTime: start,
        endTime: end,
        workshopIds: selectedWorkshops,
        sensorTypes: exportType === 'sensor' ? selectedTypes : undefined,
      })
    } finally {
      setIsExporting(false)
      onClose()
    }
  }, [exportType, getTimeRangeDates, requestExport, selectedWorkshops, selectedTypes, onClose])

  const toggleWorkshop = (workshopId: string) => {
    setSelectedWorkshops(prev =>
      prev.includes(workshopId)
        ? prev.filter(id => id !== workshopId)
        : [...prev, workshopId]
    )
  }

  const toggleType = (type: string) => {
    setSelectedTypes(prev =>
      prev.includes(type)
        ? prev.filter(t => t !== type)
        : [...prev, type]
    )
  }

  if (!isOpen) return null

  const enabledWorkshops = workshops.filter(w => w.isEnabled).sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-900 rounded-xl shadow-2xl border border-gray-700 w-full max-w-md mx-4">
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <h3 className="text-lg font-semibold text-white">导出数据</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              导出类型
            </label>
            <div className="flex gap-2">
              {[
                { value: 'sensor', label: '传感器数据' },
                { value: 'alarm', label: '告警记录' },
                { value: 'combined', label: '全部数据' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setExportType(opt.value as any)}
                  className={`flex-1 py-2 px-3 rounded text-sm font-medium transition-colors ${
                    exportType === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              时间范围
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: '1h', label: '1小时' },
                { value: '6h', label: '6小时' },
                { value: '24h', label: '24小时' },
                { value: '7d', label: '7天' },
              ].map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setTimeRange(opt.value as any)}
                  className={`py-2 px-2 rounded text-sm font-medium transition-colors ${
                    timeRange === opt.value
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              选择车间
            </label>
            <div className="flex flex-wrap gap-2">
              {enabledWorkshops.map(workshop => (
                <button
                  key={workshop.id}
                  onClick={() => toggleWorkshop(workshop.id)}
                  className={`py-1.5 px-3 rounded text-sm font-medium transition-colors ${
                    selectedWorkshops.includes(workshop.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                  }`}
                >
                  {workshop.name}
                </button>
              ))}
            </div>
          </div>

          {exportType === 'sensor' && (
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-2">
                传感器类型
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { value: 'temperature', label: '温度' },
                  { value: 'wind', label: '风速' },
                  { value: 'solar', label: '日照' },
                  { value: 'vibration', label: '振动' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => toggleType(opt.value)}
                    className={`py-1.5 px-3 rounded text-sm font-medium transition-colors ${
                      selectedTypes.includes(opt.value)
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 p-4 border-t border-gray-700">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-sm font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleExport}
            disabled={isExporting || selectedWorkshops.length === 0 || (exportType === 'sensor' && selectedTypes.length === 0)}
            className="px-4 py-2 rounded text-sm font-medium bg-green-600 text-white hover:bg-green-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? '导出中...' : '导出 CSV'}
          </button>
        </div>
      </div>
    </div>
  )
}
