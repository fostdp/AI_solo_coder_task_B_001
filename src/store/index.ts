import { create } from 'zustand'

export interface SensorConfig {
  id: string
  type: 'temperature' | 'wind' | 'solar' | 'vibration'
  latitude: number
  longitude: number
  linePositionKm: number
  lineId: string
  lineName: string
  workshopId: string
  maxAllowedTemp: number
  vibrationThreshold?: number
  isActive: boolean
}

export interface SensorData {
  id: string
  value: number
  timestamp: string
}

export interface CapacityData {
  dynamicCapacity: number
  staticCapacity: number
  marginPercent: number
  timestamp: string
}

export interface Alarm {
  id: number
  sensorId: string
  alarmType: 'overheat' | 'galloping' | 'offline'
  level: 'warning' | 'critical'
  message: string
  startedAt: string
  isActive: boolean
}

export interface SensorPrediction {
  sensorId: string
  sensorType: 'temperature' | 'vibration'
  predictedValue: number
  currentValue: number
  threshold: number
  confidence: number
  trend: 'rising' | 'falling' | 'stable'
  willTriggerAlarm: boolean
  isWarning: boolean
  predictedTime: string
  historyPoints: number
}

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

export interface WorkshopConfig {
  id: string
  name: string
  description: string
  displayOrder: number
  isEnabled: boolean
}

interface SensorState {
  sensors: SensorConfig[]
  sensorData: Map<string, SensorData>
  capacity: CapacityData | null
  alarms: Alarm[]
  predictions: Map<string, SensorPrediction>
  workshopAnomalies: Map<string, WorkshopAnomaly>
  workshopStatuses: Map<string, WorkshopStatus>
  workshops: WorkshopConfig[]
  selectedWorkshopId: string
  selectedSensor: string | null
  historyData: Map<string, Array<{ timestamp: string; value: number }>>
  isConnected: boolean
  autoPlay: boolean
  autoPlayInterval: number
  isPaused: boolean
  pauseReason: 'alarm' | 'manual' | null
}

interface SensorActions {
  setSensors: (sensors: SensorConfig[]) => void
  updateSensorData: (data: SensorData[]) => void
  setCapacity: (capacity: CapacityData) => void
  addAlarm: (alarm: Alarm) => void
  setSelectedSensor: (id: string | null) => void
  setHistoryData: (sensorId: string, data: Array<{ timestamp: string; value: number }>) => void
  setConnected: (connected: boolean) => void
  getSensorById: (id: string) => SensorConfig | undefined
  getSensorData: (id: string) => SensorData | undefined
  getTemperatureColor: (value: number, maxTemp: number) => string
  hasAlarm: (sensorId: string) => Alarm | undefined
  getNearestSensorByType: (km: number, type: 'temperature' | 'wind' | 'solar' | 'vibration') => SensorConfig | undefined
  updatePrediction: (prediction: SensorPrediction) => void
  updateWorkshopAnomaly: (anomaly: WorkshopAnomaly) => void
  updateWorkshopStatus: (status: WorkshopStatus) => void
  updateAllWorkshopStatuses: (statuses: WorkshopStatus[]) => void
  setWorkshops: (workshops: WorkshopConfig[]) => void
  setSelectedWorkshop: (workshopId: string) => void
  getSensorsByWorkshop: (workshopId: string) => SensorConfig[]
  setAutoPlay: (enabled: boolean) => void
  setAutoPlayInterval: (interval: number) => void
  pauseAutoPlay: (reason?: 'alarm' | 'manual') => void
  resumeAutoPlay: () => void
  getNextWorkshop: () => string
  getActiveAnomalyWorkshops: () => string[]
  getPredictionsForWorkshop: (workshopId: string) => SensorPrediction[]
  getWarningCount: (workshopId: string) => number
}

export type SensorStore = SensorState & SensorActions

export const useSensorStore = create<SensorStore>((set, get) => ({
  sensors: [],
  sensorData: new Map(),
  capacity: null,
  alarms: [],
  predictions: new Map(),
  workshopAnomalies: new Map(),
  workshopStatuses: new Map(),
  workshops: [],
  selectedWorkshopId: 'WS-001',
  selectedSensor: null,
  historyData: new Map(),
  isConnected: false,
  autoPlay: false,
  autoPlayInterval: 10000,
  isPaused: false,
  pauseReason: null,

  setSensors: (sensors) => set({ sensors }),

  updateSensorData: (data) => {
    set((state) => {
      const newMap = new Map(state.sensorData)
      data.forEach((d) => {
        newMap.set(d.id, d)
      })
      return { sensorData: newMap }
    })
  },

  setCapacity: (capacity) => set({ capacity }),

  addAlarm: (alarm) => {
    set((state) => ({
      alarms: [alarm, ...state.alarms.filter((a) => a.id !== alarm.id)].slice(0, 100),
    }))
  },

  setSelectedSensor: (id) => set({ selectedSensor: id }),

  setHistoryData: (sensorId, data) => {
    set((state) => {
      const newMap = new Map(state.historyData)
      newMap.set(sensorId, data)
      return { historyData: newMap }
    })
  },

  setConnected: (connected) => set({ isConnected: connected }),

  getSensorById: (id) => get().sensors.find((s) => s.id === id),

  getSensorData: (id) => get().sensorData.get(id),

  getTemperatureColor: (value, maxTemp) => {
    const ratio = value / maxTemp
    if (ratio < 0.8) return '#2ed573'
    if (ratio < 0.95) return '#ffa502'
    return '#ff4757'
  },

  hasAlarm: (sensorId) => {
    return get().alarms.find((a) => a.sensorId === sensorId && a.isActive)
  },

  getNearestSensorByType: (km, type) => {
    const sensors = get().sensors.filter((s) => s.type === type)
    if (sensors.length === 0) return undefined
    return sensors.reduce((nearest, s) => {
      const dist = Math.abs(s.linePositionKm - km)
      const nearestDist = Math.abs(nearest.linePositionKm - km)
      return dist < nearestDist ? s : nearest
    })
  },

  updatePrediction: (prediction) => {
    set((state) => {
      const newMap = new Map(state.predictions)
      newMap.set(prediction.sensorId, prediction)
      return { predictions: newMap }
    })
  },

  updateWorkshopAnomaly: (anomaly) => {
    set((state) => {
      const newMap = new Map(state.workshopAnomalies)
      if (anomaly.isActive) {
        newMap.set(anomaly.workshopId, anomaly)
        if (get().autoPlay && !get().isPaused) {
          set({ isPaused: true, pauseReason: 'alarm', selectedWorkshopId: anomaly.workshopId })
        }
      } else {
        newMap.delete(anomaly.workshopId)
      }
      return { workshopAnomalies: newMap }
    })
  },

  updateWorkshopStatus: (status) => {
    set((state) => {
      const newMap = new Map(state.workshopStatuses)
      newMap.set(status.workshopId, status)
      return { workshopStatuses: newMap }
    })
  },

  updateAllWorkshopStatuses: (statuses) => {
    set((state) => {
      const newMap = new Map(state.workshopStatuses)
      statuses.forEach((status) => {
        newMap.set(status.workshopId, status)
      })
      return { workshopStatuses: newMap }
    })
  },

  setWorkshops: (workshops) => set({ workshops }),

  setSelectedWorkshop: (workshopId) => set({ selectedWorkshopId: workshopId }),

  getSensorsByWorkshop: (workshopId) => {
    return get().sensors.filter((s) => s.workshopId === workshopId)
  },

  setAutoPlay: (enabled) => set({ autoPlay: enabled, isPaused: false, pauseReason: null }),

  setAutoPlayInterval: (interval) => set({ autoPlayInterval: interval }),

  pauseAutoPlay: (reason = 'manual') => set({ isPaused: true, pauseReason: reason }),

  resumeAutoPlay: () => {
    const state = get()
    const hasActiveAnomalies = state.workshopAnomalies.size > 0
    if (!hasActiveAnomalies) {
      set({ isPaused: false, pauseReason: null })
    }
  },

  getNextWorkshop: () => {
    const state = get()
    const enabledWorkshops = state.workshops.filter((w) => w.isEnabled)
    const currentIndex = enabledWorkshops.findIndex((w) => w.id === state.selectedWorkshopId)
    const nextIndex = (currentIndex + 1) % enabledWorkshops.length
    return enabledWorkshops[nextIndex]?.id || state.selectedWorkshopId
  },

  getActiveAnomalyWorkshops: () => {
    return Array.from(get().workshopAnomalies.values())
      .filter((a) => a.isActive)
      .map((a) => a.workshopId)
  },

  getPredictionsForWorkshop: (workshopId) => {
    const state = get()
    const workshopSensors = state.sensors.filter((s) => s.workshopId === workshopId)
    const predictions: SensorPrediction[] = []
    workshopSensors.forEach((sensor) => {
      const pred = state.predictions.get(sensor.id)
      if (pred) predictions.push(pred)
    })
    return predictions
  },

  getWarningCount: (workshopId) => {
    return get().getPredictionsForWorkshop(workshopId).filter((p) => p.isWarning).length
  },
}))
