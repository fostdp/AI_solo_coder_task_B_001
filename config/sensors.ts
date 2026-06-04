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

const LINE_CONFIGS = [
  {
    lineId: 'LINE-001',
    lineName: '江城III回线',
    workshopId: 'WS-001',
    lengthKm: 200,
    baseLat: 30.0,
    baseLng: 114.0,
    tempCount: 80,
    windCount: 60,
    solarCount: 40,
    vibrationCount: 30,
  },
  {
    lineId: 'LINE-002',
    lineName: '江城IV回线',
    workshopId: 'WS-002',
    lengthKm: 180,
    baseLat: 30.2,
    baseLng: 114.3,
    tempCount: 72,
    windCount: 54,
    solarCount: 36,
    vibrationCount: 27,
  },
  {
    lineId: 'LINE-003',
    lineName: '江城V回线',
    workshopId: 'WS-003',
    lengthKm: 150,
    baseLat: 29.8,
    baseLng: 113.8,
    tempCount: 60,
    windCount: 45,
    solarCount: 30,
    vibrationCount: 23,
  },
]

const KM_PER_DEGREE = 0.009

function generateSensorsForLine(config: typeof LINE_CONFIGS[0]): SensorConfig[] {
  const sensors: SensorConfig[] = []
  const { lineId, lineName, workshopId, lengthKm, baseLat, baseLng } = config

  for (let i = 0; i < config.tempCount; i++) {
    const km = (lengthKm / config.tempCount) * (i + 0.5)
    sensors.push({
      id: `T${lineId.split('-')[1]}-${String(i + 1).padStart(3, '0')}`,
      type: 'temperature',
      latitude: baseLat + km * KM_PER_DEGREE * 0.3,
      longitude: baseLng + km * KM_PER_DEGREE,
      linePositionKm: Math.round(km * 10) / 10,
      lineId,
      lineName,
      workshopId,
      maxAllowedTemp: 70.0,
      isActive: true,
    })
  }

  for (let i = 0; i < config.windCount; i++) {
    const km = (lengthKm / config.windCount) * (i + 0.5)
    sensors.push({
      id: `W${lineId.split('-')[1]}-${String(i + 1).padStart(3, '0')}`,
      type: 'wind',
      latitude: baseLat + km * KM_PER_DEGREE * 0.3 + 0.002,
      longitude: baseLng + km * KM_PER_DEGREE + 0.002,
      linePositionKm: Math.round(km * 10) / 10,
      lineId,
      lineName,
      workshopId,
      maxAllowedTemp: 70.0,
      isActive: true,
    })
  }

  for (let i = 0; i < config.solarCount; i++) {
    const km = (lengthKm / config.solarCount) * (i + 0.5)
    sensors.push({
      id: `S${lineId.split('-')[1]}-${String(i + 1).padStart(3, '0')}`,
      type: 'solar',
      latitude: baseLat + km * KM_PER_DEGREE * 0.3 - 0.002,
      longitude: baseLng + km * KM_PER_DEGREE - 0.002,
      linePositionKm: Math.round(km * 10) / 10,
      lineId,
      lineName,
      workshopId,
      maxAllowedTemp: 70.0,
      isActive: true,
    })
  }

  for (let i = 0; i < config.vibrationCount; i++) {
    const km = (lengthKm / config.vibrationCount) * (i + 0.5)
    sensors.push({
      id: `V${lineId.split('-')[1]}-${String(i + 1).padStart(3, '0')}`,
      type: 'vibration',
      latitude: baseLat + km * KM_PER_DEGREE * 0.3 + 0.001,
      longitude: baseLng + km * KM_PER_DEGREE - 0.001,
      linePositionKm: Math.round(km * 10) / 10,
      lineId,
      lineName,
      workshopId,
      maxAllowedTemp: 70.0,
      vibrationThreshold: 5.0,
      isActive: true,
    })
  }

  return sensors
}

function generateAllSensors(): SensorConfig[] {
  const allSensors: SensorConfig[] = []
  for (const config of LINE_CONFIGS) {
    allSensors.push(...generateSensorsForLine(config))
  }
  return allSensors
}

export const SENSORS: SensorConfig[] = generateAllSensors()

export function getSensorById(id: string): SensorConfig | undefined {
  return SENSORS.find(s => s.id === id)
}

export function getSensorsByType(type: 'temperature' | 'wind' | 'solar' | 'vibration'): SensorConfig[] {
  return SENSORS.filter(s => s.type === type)
}

export function getSensorsByWorkshop(workshopId: string): SensorConfig[] {
  return SENSORS.filter(s => s.workshopId === workshopId)
}

export function getSensorsByLine(lineId: string): SensorConfig[] {
  return SENSORS.filter(s => s.lineId === lineId)
}

export function getNearestSensors(
  km: number,
  type?: 'temperature' | 'wind' | 'solar' | 'vibration',
  count: number = 3,
  lineId?: string,
): SensorConfig[] {
  let candidates = SENSORS
  if (type) candidates = candidates.filter(s => s.type === type)
  if (lineId) candidates = candidates.filter(s => s.lineId === lineId)
  
  return candidates
    .map(s => ({ ...s, distance: Math.abs(s.linePositionKm - km) }))
    .sort((a, b) => a.distance - b.distance)
    .slice(0, count)
}

export function getLineIds(): string[] {
  return [...new Set(SENSORS.map(s => s.lineId))]
}

export function getWorkshopIds(): string[] {
  return [...new Set(SENSORS.map(s => s.workshopId))]
}
