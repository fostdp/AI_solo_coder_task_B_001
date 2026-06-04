export interface TowerConfig {
  id: string
  name: string
  km: number
  latitude: number
  longitude: number
  elevation: number
  towerType: 'tangent' | 'angle' | 'dead-end'
  lineId: string
}

export interface LineSegmentConfig {
  id: string
  fromTower: string
  toTower: string
  lengthKm: number
  conductorType: string
  maxAllowedTemp: number
  lineId: string
}

export interface LineCorridorConfig {
  lineId: string
  lineName: string
  workshopId: string
  totalLengthKm: number
  voltageLevel: string
  towers: TowerConfig[]
  segments: LineSegmentConfig[]
  boundingBox: {
    minLat: number
    maxLat: number
    minLng: number
    maxLng: number
  }
}

export interface ConductorSpec {
  code: string
  name: string
  diameter: number
  crossSection: number
  dcResistance20C: number
  acResistance20C: number
  weightPerMeter: number
  ratedBreakingStrength: number
}

export const CONDUCTOR_SPECS: Record<string, ConductorSpec> = {
  'LGJ-240/30': {
    code: 'LGJ-240/30',
    name: '钢芯铝绞线 240/30',
    diameter: 0.0216,
    crossSection: 275.96,
    dcResistance20C: 0.1181,
    acResistance20C: 0.119,
    weightPerMeter: 0.925,
    ratedBreakingStrength: 75620,
  },
  'LGJ-300/40': {
    code: 'LGJ-300/40',
    name: '钢芯铝绞线 300/40',
    diameter: 0.02394,
    crossSection: 338.99,
    dcResistance20C: 0.0939,
    acResistance20C: 0.095,
    weightPerMeter: 1.133,
    ratedBreakingStrength: 92220,
  },
  'LGJ-400/35': {
    code: 'LGJ-400/35',
    name: '钢芯铝绞线 400/35',
    diameter: 0.02682,
    crossSection: 425.24,
    dcResistance20C: 0.07389,
    acResistance20C: 0.075,
    weightPerMeter: 1.349,
    ratedBreakingStrength: 103900,
  },
  'LGJ-630/45': {
    code: 'LGJ-630/45',
    name: '钢芯铝绞线 630/45',
    diameter: 0.0338,
    crossSection: 666.55,
    dcResistance20C: 0.04633,
    acResistance20C: 0.048,
    weightPerMeter: 2.06,
    ratedBreakingStrength: 148700,
  },
}

function generateTowers(
  lineId: string,
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number,
  totalKm: number,
  count: number
): TowerConfig[] {
  const towers: TowerConfig[] = []
  const latStep = (endLat - startLat) / (count - 1)
  const lngStep = (endLng - startLng) / (count - 1)
  const kmStep = totalKm / (count - 1)

  for (let i = 0; i < count; i++) {
    const isEven = i % 2 === 0
    const isTen = i % 10 === 0
    const km = i * kmStep
    towers.push({
      id: `${lineId}-T${String(i).padStart(3, '0')}`,
      name: `#${i}号杆塔`,
      km,
      latitude: startLat + latStep * i + (isEven ? 0.0001 : -0.0001) * Math.sin(km * 0.5),
      longitude: startLng + lngStep * i + (isEven ? 0.00015 : -0.00008) * Math.cos(km * 0.3),
      elevation: 50 + Math.sin(km * 0.2) * 30 + (i % 7 === 0 ? 20 : 0),
      towerType: isTen ? 'dead-end' : (i % 4 === 0 ? 'angle' : 'tangent'),
      lineId,
    })
  }
  return towers
}

const LINE_CONFIGS = [
  {
    lineId: 'LINE-001',
    lineName: '220kV 江城III回线',
    workshopId: 'WS-001',
    voltageLevel: '220kV',
    startLat: 30.45,
    startLng: 114.30,
    endLat: 30.75,
    endLng: 114.55,
    totalKm: 200,
    towerCount: 41,
  },
  {
    lineId: 'LINE-002',
    lineName: '220kV 江城IV回线',
    workshopId: 'WS-002',
    voltageLevel: '220kV',
    startLat: 30.55,
    startLng: 114.10,
    endLat: 30.85,
    endLng: 114.35,
    totalKm: 180,
    towerCount: 37,
  },
  {
    lineId: 'LINE-003',
    lineName: '220kV 江城V回线',
    workshopId: 'WS-003',
    voltageLevel: '220kV',
    startLat: 30.25,
    startLng: 113.80,
    endLat: 30.55,
    endLng: 114.05,
    totalKm: 150,
    towerCount: 31,
  },
]

function generateLineCorridors(): LineCorridorConfig[] {
  return LINE_CONFIGS.map(config => {
    const towers = generateTowers(
      config.lineId,
      config.startLat,
      config.startLng,
      config.endLat,
      config.endLng,
      config.totalKm,
      config.towerCount
    )

    const segments: LineSegmentConfig[] = towers.slice(0, -1).map((tower, i) => {
      const nextTower = towers[i + 1]
      return {
        id: `${config.lineId}-SEG-${String(i).padStart(3, '0')}`,
        fromTower: tower.id,
        toTower: nextTower.id,
        lengthKm: nextTower.km - tower.km,
        conductorType: i < 10 ? 'LGJ-400/35' : (i < 25 ? 'LGJ-630/45' : 'LGJ-400/35'),
        maxAllowedTemp: 70,
        lineId: config.lineId,
      }
    })

    const latArray = towers.map(t => t.latitude)
    const lngArray = towers.map(t => t.longitude)

    return {
      lineId: config.lineId,
      lineName: config.lineName,
      workshopId: config.workshopId,
      totalLengthKm: config.totalKm,
      voltageLevel: config.voltageLevel,
      towers,
      segments,
      boundingBox: {
        minLat: Math.min(...latArray) - 0.002,
        maxLat: Math.max(...latArray) + 0.002,
        minLng: Math.min(...lngArray) - 0.002,
        maxLng: Math.max(...lngArray) + 0.002,
      },
    }
  })
}

export const LINE_CORRIDORS: LineCorridorConfig[] = generateLineCorridors()

export const LINE_CORRIDOR_CONFIG: LineCorridorConfig = LINE_CORRIDORS[0]

export function getLineCorridorById(lineId: string): LineCorridorConfig | undefined {
  return LINE_CORRIDORS.find(l => l.lineId === lineId)
}

export function getLineCorridorsByWorkshop(workshopId: string): LineCorridorConfig[] {
  return LINE_CORRIDORS.filter(l => l.workshopId === workshopId)
}

export function getTowerAtKm(km: number, lineId?: string): TowerConfig {
  const towers = lineId 
    ? LINE_CORRIDORS.find(l => l.lineId === lineId)?.towers || LINE_CORRIDORS[0].towers
    : LINE_CORRIDORS[0].towers
  return towers.reduce((nearest, t) => {
    const d = Math.abs(t.km - km)
    const nearestD = Math.abs(nearest.km - km)
    return d < nearestD ? t : nearest
  })
}

export function getSegmentAtKm(km: number, lineId?: string): LineSegmentConfig | undefined {
  const config = lineId 
    ? LINE_CORRIDORS.find(l => l.lineId === lineId)
    : LINE_CORRIDORS[0]
  if (!config) return undefined
  
  return config.segments.find(s => {
    const fromTower = config.towers.find(t => t.id === s.fromTower)
    const toTower = config.towers.find(t => t.id === s.toTower)
    return fromTower && toTower && km >= fromTower.km && km < toTower.km
  })
}

export function getPathPoints(lineId?: string): Array<{ x: number; y: number; km: number }> {
  const config = lineId 
    ? LINE_CORRIDORS.find(l => l.lineId === lineId)
    : LINE_CORRIDORS[0]
  if (!config) return []
  
  return config.towers.map(t => ({
    x: t.longitude,
    y: t.latitude,
    km: t.km,
  }))
}

export function getAllLineIds(): string[] {
  return LINE_CORRIDORS.map(l => l.lineId)
}
