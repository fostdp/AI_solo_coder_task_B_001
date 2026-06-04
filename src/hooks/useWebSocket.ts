import { useEffect, useRef, useCallback } from 'react'
import { useSensorStore, type SensorConfig, type CapacityData, type Alarm, type SensorPrediction, type WorkshopAnomaly, type WorkshopStatus, type WorkshopConfig } from '../store/index.js'
import { WORKSHOPS } from '../../config/workshops.js'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'

interface WebSocketMessage {
  type: string
  [key: string]: unknown
}

interface InitialDataMessage extends WebSocketMessage {
  sensors: SensorConfig[]
  sensorData: Array<{ id: string; value: number; timestamp: string }>
  capacity: CapacityData | null
}

interface SensorDataMessage extends WebSocketMessage {
  sensors: Array<{
    id: string
    type: 'temperature' | 'wind' | 'solar' | 'vibration'
    value: number
    timestamp: string
  }>
}

interface CapacityMessage extends WebSocketMessage {
  data: CapacityData
}

interface AlarmMessage extends WebSocketMessage {
  alarm: Alarm
}

interface PredictionMessage extends WebSocketMessage {
  type: 'sensor' | 'workshop' | 'batch'
  data: SensorPrediction | { workshopId: string; predictions: SensorPrediction[] } | SensorPrediction[]
}

interface WorkshopAnomalyMessage extends WebSocketMessage {
  anomaly: WorkshopAnomaly
}

interface WorkshopStatusMessage extends WebSocketMessage {
  status: WorkshopStatus | { all: WorkshopStatus[] }
}

interface HistoryResponseMessage extends WebSocketMessage {
  sensorId: string
  data: Array<{ timestamp: string; value: number }>
}

interface ExportResponseMessage extends WebSocketMessage {
  success: boolean
  filename: string
  data: string
  recordCount: number
  error?: string
}

export function useWebSocket() {
  const wsRef = useRef<WebSocket | null>(null)
  const {
    setSensors,
    updateSensorData,
    setCapacity,
    addAlarm,
    setHistoryData,
    setConnected,
    updatePrediction,
    updateWorkshopAnomaly,
    updateWorkshopStatus,
    updateAllWorkshopStatuses,
    setWorkshops,
  } = useSensorStore()

  useEffect(() => {
    setWorkshops(WORKSHOPS.map(w => ({
      id: w.id,
      name: w.name,
      description: w.description,
      displayOrder: w.displayOrder,
      isEnabled: w.isEnabled,
    })))
  }, [setWorkshops])

  const connect = useCallback(() => {
    const ws = new WebSocket(WS_URL + '/ws')

    ws.onopen = () => {
      console.log('WebSocket connected')
      setConnected(true)
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as WebSocketMessage
        handleMessage(message)
      } catch (err) {
        console.error('Error parsing WebSocket message:', err)
      }
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
      setConnected(false)
      setTimeout(() => {
        connect()
      }, 3000)
    }

    ws.onerror = (err) => {
      console.error('WebSocket error:', err)
    }

    wsRef.current = ws
  }, [setConnected])

  const handleMessage = useCallback(
    (message: WebSocketMessage) => {
      switch (message.type) {
        case 'initial_data': {
          const { sensors = [], sensorData = [], capacity } =
            message as InitialDataMessage
          setSensors(sensors)
          updateSensorData(sensorData.map(d => ({ id: d.id, value: d.value, timestamp: d.timestamp })))
          if (capacity) {
            setCapacity(capacity)
          }
          break
        }
        case 'sensor_data': {
          const { sensors = [] } = message as SensorDataMessage
          const validSensors = sensors.filter(s => s && s.id !== undefined)
          updateSensorData(validSensors.map(s => ({ id: s.id, value: s.value, timestamp: s.timestamp })))
          break
        }
        case 'capacity': {
          const { data } = message as CapacityMessage
          if (data) {
            setCapacity(data)
          }
          break
        }
        case 'alarm': {
          const { alarm } = message as AlarmMessage
          if (alarm) {
            addAlarm(alarm)
          }
          break
        }
        case 'prediction': {
          const { type, data } = message as PredictionMessage
          if (type === 'sensor' && data && typeof data === 'object' && 'sensorId' in data) {
            updatePrediction(data as SensorPrediction)
          } else if (type === 'batch' && Array.isArray(data)) {
            data.forEach(pred => {
              if (pred && 'sensorId' in pred) {
                updatePrediction(pred)
              }
            })
          }
          break
        }
        case 'workshop_anomaly': {
          const { anomaly } = message as WorkshopAnomalyMessage
          if (anomaly) {
            updateWorkshopAnomaly(anomaly)
          }
          break
        }
        case 'workshop_status': {
          const { status } = message as WorkshopStatusMessage
          if (status && 'all' in status && Array.isArray(status.all)) {
            updateAllWorkshopStatuses(status.all)
          } else if (status && 'workshopId' in status) {
            updateWorkshopStatus(status as WorkshopStatus)
          }
          break
        }
        case 'export_response': {
          const response = message as ExportResponseMessage
          if (response.success && response.data) {
            downloadCSV(response.data, response.filename)
          } else if (response.error) {
            console.error('Export error:', response.error)
          }
          break
        }
        case 'history_response': {
          const { sensorId, data = [] } = message as HistoryResponseMessage
          if (sensorId) {
            setHistoryData(sensorId, data)
          }
          break
        }
      }
    },
    [setSensors, updateSensorData, setCapacity, addAlarm, setHistoryData, updatePrediction, updateWorkshopAnomaly, updateWorkshopStatus, updateAllWorkshopStatuses]
  )

  const downloadCSV = (data: string, filename: string) => {
    const blob = new Blob(['\ufeff' + data], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const sendMessage = useCallback((message: WebSocketMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message))
    }
  }, [])

  const requestHistory = useCallback(
    (sensorId: string, hours: number = 1) => {
      sendMessage({ type: 'history_request', sensorId, hours })
    },
    [sendMessage]
  )

  const requestExport = useCallback(
    (options: {
      exportType: 'sensor' | 'alarm' | 'combined'
      startTime: Date
      endTime: Date
      workshopIds?: string[]
      sensorTypes?: string[]
    }) => {
      sendMessage({
        type: 'export_request',
        ...options,
        startTime: options.startTime.toISOString(),
        endTime: options.endTime.toISOString(),
      })
    },
    [sendMessage]
  )

  const requestPredictions = useCallback(() => {
    sendMessage({ type: 'get_predictions' })
  }, [sendMessage])

  const requestWorkshopStatuses = useCallback(() => {
    sendMessage({ type: 'get_workshop_statuses' })
  }, [sendMessage])

  useEffect(() => {
    connect()

    return () => {
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [connect])

  return {
    sendMessage,
    requestHistory,
    requestExport,
    requestPredictions,
    requestWorkshopStatuses,
  }
}
