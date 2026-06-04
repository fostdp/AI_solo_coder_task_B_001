export interface WorkshopConfig {
  id: string
  name: string
  description: string
  lineIds: string[]
  displayOrder: number
  isEnabled: boolean
}

export const WORKSHOPS: WorkshopConfig[] = [
  {
    id: 'WS-001',
    name: '一车间',
    description: '江城III回线 - 东段',
    lineIds: ['LINE-001'],
    displayOrder: 1,
    isEnabled: true,
  },
  {
    id: 'WS-002',
    name: '二车间',
    description: '江城IV回线 - 西段',
    lineIds: ['LINE-002'],
    displayOrder: 2,
    isEnabled: true,
  },
  {
    id: 'WS-003',
    name: '三车间',
    description: '江城V回线 - 北段',
    lineIds: ['LINE-003'],
    displayOrder: 3,
    isEnabled: true,
  },
]

export function getWorkshopById(id: string): WorkshopConfig | undefined {
  return WORKSHOPS.find(w => w.id === id)
}

export function getEnabledWorkshops(): WorkshopConfig[] {
  return WORKSHOPS.filter(w => w.isEnabled).sort((a, b) => a.displayOrder - b.displayOrder)
}

export function getWorkshopByLineId(lineId: string): WorkshopConfig | undefined {
  return WORKSHOPS.find(w => w.lineIds.includes(lineId))
}

export const WORKSHOP_THRESHOLD = {
  anomalyDevicePercent: 0.3,
  autoSwitchIntervalMs: 10000,
  pauseOnAlarm: true,
}
