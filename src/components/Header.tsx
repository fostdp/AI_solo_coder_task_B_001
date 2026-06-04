import { Activity, Wifi, WifiOff, Clock, Thermometer, Wind, Sun, Download, AlertTriangle, Zap } from 'lucide-react'
import { useSensorStore } from '../store/index.js'
import { useState, useEffect } from 'react'
import { WorkshopSelector } from './WorkshopSelector.js'
import { ExportDialog } from './ExportDialog.js'

export function Header() {
  const { 
    isConnected, 
    sensors = [], 
    sensorData, 
    alarms = [],
    predictions,
    selectedWorkshopId,
    getSensorsByWorkshop,
    getWarningCount,
  } = useSensorStore()
  
  const [currentTime, setCurrentTime] = useState(new Date())
  const [showExportDialog, setShowExportDialog] = useState(false)

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])

  const workshopSensors = getSensorsByWorkshop(selectedWorkshopId)
  const activeAlarms = alarms.filter((a) => a?.isActive && 
    workshopSensors.some(s => s.id === a.sensorId)
  ).length
  
  const onlineSensors = workshopSensors.filter(s => sensorData.has(s.id)).length
  const totalSensors = workshopSensors.length
  const warningCount = getWarningCount(selectedWorkshopId)

  const getMaxValue = (type: string) => {
    const typeSensors = workshopSensors.filter((s) => s.type === type)
    let max = 0
    for (const s of typeSensors) {
      const data = sensorData.get(s.id)
      if (data && data.value > max) max = data.value
    }
    return max
  }

  const maxTemp = getMaxValue('temperature')
  const maxWind = getMaxValue('wind')
  const maxSolar = getMaxValue('solar')

  return (
    <>
      <header className="absolute top-0 left-0 right-0 h-20 bg-[#0a1628]/95 backdrop-blur-md border-b border-[#00d4ff]/30 flex flex-col px-4 z-30">
        <div className="flex items-center justify-between h-10 border-b border-white/10">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Activity className="w-6 h-6 text-[#00d4ff]" />
                <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
              </div>
              <div>
                <h1 className="text-white font-bold text-base">电网输电线路动态增容监测系统</h1>
              </div>
            </div>
          </div>

          <WorkshopSelector className="text-sm" />

          <div className="flex items-center gap-4">
            {warningCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-orange-500/20 border border-orange-500/30">
                <Zap className="w-4 h-4 text-orange-400" />
                <span className="text-orange-400 text-sm font-bold">{warningCount} 预警</span>
              </div>
            )}

            <button
              onClick={() => setShowExportDialog(true)}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-600/20 border border-green-500/30 hover:bg-green-600/30 transition-colors text-sm"
            >
              <Download className="w-4 h-4 text-green-400" />
              <span className="text-green-400">导出数据</span>
            </button>

            <div className="flex items-center gap-2 text-gray-400 text-sm">
              <Clock className="w-4 h-4" />
              <span className="font-mono">
                {currentTime.toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between h-10">
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
              <Thermometer className="w-4 h-4 text-red-400" />
              <span className="text-gray-400">最高温</span>
              <span className="text-red-400 font-mono font-bold">{maxTemp.toFixed(1)}°C</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20">
              <Wind className="w-4 h-4 text-blue-400" />
              <span className="text-gray-400">最大风</span>
              <span className="text-blue-400 font-mono font-bold">{maxWind.toFixed(1)} m/s</span>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <Sun className="w-4 h-4 text-yellow-400" />
              <span className="text-gray-400">最大日照</span>
              <span className="text-yellow-400 font-mono font-bold">{maxSolar.toFixed(0)} W/m²</span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              {isConnected ? (
                <>
                  <Wifi className="w-4 h-4 text-green-400" />
                  <span className="text-green-400">已连接</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-4 h-4 text-red-400" />
                  <span className="text-red-400">断开</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-white/5">
              <span className="text-gray-400">传感器</span>
              <span className="text-white font-mono font-bold">
                {onlineSensors}/{totalSensors}
              </span>
            </div>

            {activeAlarms > 0 && (
              <div className="flex items-center gap-2 px-3 py-1 rounded-lg bg-red-500/20 border border-red-500/30 animate-pulse">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-red-400 font-bold">{activeAlarms}</span>
                <span className="text-red-400">告警</span>
              </div>
            )}
          </div>
        </div>
      </header>

      <ExportDialog 
        isOpen={showExportDialog} 
        onClose={() => setShowExportDialog(false)} 
      />
    </>
  )
}
