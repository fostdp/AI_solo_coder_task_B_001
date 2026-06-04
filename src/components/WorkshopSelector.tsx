import { useEffect, useCallback } from 'react'
import { useSensorStore, type WorkshopStatus, type WorkshopAnomaly } from '../store/index.js'

interface WorkshopSelectorProps {
  className?: string
}

export function WorkshopSelector({ className = '' }: WorkshopSelectorProps) {
  const {
    workshops,
    selectedWorkshopId,
    setSelectedWorkshop,
    workshopStatuses,
    workshopAnomalies,
    autoPlay,
    isPaused,
    pauseReason,
    setAutoPlay,
    getNextWorkshop,
    resumeAutoPlay,
    pauseAutoPlay,
  } = useSensorStore()

  useEffect(() => {
    if (!autoPlay || isPaused) return

    const interval = setInterval(() => {
      const nextWorkshop = getNextWorkshop()
      setSelectedWorkshop(nextWorkshop)
    }, useSensorStore.getState().autoPlayInterval)

    return () => clearInterval(interval)
  }, [autoPlay, isPaused, getNextWorkshop, setSelectedWorkshop])

  const getStatusBadge = (workshopId: string) => {
    const anomaly = workshopAnomalies.get(workshopId)
    const status = workshopStatuses.get(workshopId)

    if (anomaly?.isActive) {
      return (
        <span className={`px-2 py-0.5 text-xs rounded-full ${
          anomaly.severity === 'critical' 
            ? 'bg-red-500 text-white animate-pulse' 
            : 'bg-yellow-500 text-black'
        }`}>
          {anomaly.severity === 'critical' ? '严重异常' : '异常'}
        </span>
      )
    }

    if (status?.anomalyLevel === 'attention') {
      return (
        <span className="px-2 py-0.5 text-xs rounded-full bg-orange-500 text-black">
          注意
        </span>
      )
    }

    return null
  }

  const handleWorkshopClick = useCallback((workshopId: string) => {
    setSelectedWorkshop(workshopId)
    if (autoPlay && !isPaused) {
      pauseAutoPlay('manual')
    }
  }, [setSelectedWorkshop, autoPlay, isPaused, pauseAutoPlay])

  const enabledWorkshops = workshops.filter(w => w.isEnabled).sort((a, b) => a.displayOrder - b.displayOrder)

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      <div className="flex items-center gap-2">
        {enabledWorkshops.map((workshop) => {
          const isSelected = selectedWorkshopId === workshop.id
          const anomaly = workshopAnomalies.get(workshop.id)
          
          return (
            <button
              key={workshop.id}
              onClick={() => handleWorkshopClick(workshop.id)}
              className={`
                relative px-4 py-2 rounded-lg font-medium transition-all duration-300
                ${isSelected 
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/30' 
                  : anomaly?.isActive
                    ? 'bg-red-900/50 text-red-300 border border-red-500/50'
                    : 'bg-gray-800/50 text-gray-300 hover:bg-gray-700/50'
                }
              `}
            >
              <div className="flex items-center gap-2">
                <span>{workshop.name}</span>
                {getStatusBadge(workshop.id)}
              </div>
              {anomaly?.isActive && (
                <div className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 rounded-full animate-ping" />
              )}
            </button>
          )
        })}
      </div>

      <div className="flex items-center gap-2 border-l border-gray-700 pl-4">
        <button
          onClick={() => setAutoPlay(!autoPlay)}
          className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
            autoPlay 
              ? 'bg-green-600 text-white' 
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {autoPlay ? '⏸ 轮播中' : '▶ 开始轮播'}
        </button>

        {isPaused && (
          <div className="flex items-center gap-2">
            <span className={`text-sm ${pauseReason === 'alarm' ? 'text-red-400' : 'text-yellow-400'}`}>
              {pauseReason === 'alarm' ? '告警暂停' : '手动暂停'}
            </span>
            <button
              onClick={() => resumeAutoPlay()}
              className="px-2 py-1 rounded text-xs bg-blue-600 text-white hover:bg-blue-500 transition-colors"
            >
              继续
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
