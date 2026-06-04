export interface WorkshopConfig {
  id: string
  name: string
  description: string
  displayOrder: number
  isEnabled: boolean
}

export interface WorkshopAnomaly {
  workshopId: string
  isActive: boolean
  severity: 'warning' | 'critical' | 'info'
}

export type PauseReason = 'alarm' | 'manual' | null

export interface CarouselState {
  isPlaying: boolean
  isPaused: boolean
  pauseReason: PauseReason
  currentWorkshopId: string
  intervalMs: number
  workshops: WorkshopConfig[]
  anomalies: Map<string, WorkshopAnomaly>
}

export interface CarouselControllerConfig {
  defaultIntervalMs?: number
  autoResumeDelayMs?: number
}

export type CarouselEventType =
  | 'workshop_change'
  | 'play'
  | 'pause'
  | 'resume'
  | 'interval_change'

export interface CarouselEvent {
  type: CarouselEventType
  previousWorkshopId?: string
  currentWorkshopId?: string
  pauseReason?: PauseReason
  timestamp: Date
}

export class CarouselController {
  private state: CarouselState
  private timer: ReturnType<typeof setInterval> | null = null
  private listeners: Map<CarouselEventType, Set<(event: CarouselEvent) => void>> = new Map()
  private config: Required<CarouselControllerConfig>

  constructor(config: CarouselControllerConfig = {}) {
    this.config = {
      defaultIntervalMs: config.defaultIntervalMs ?? 10000,
      autoResumeDelayMs: config.autoResumeDelayMs ?? 5000,
    }

    this.state = {
      isPlaying: false,
      isPaused: false,
      pauseReason: null,
      currentWorkshopId: '',
      intervalMs: this.config.defaultIntervalMs,
      workshops: [],
      anomalies: new Map(),
    }
  }

  public setWorkshops(workshops: WorkshopConfig[]): void {
    this.state.workshops = [...workshops]
  }

  public setCurrentWorkshop(workshopId: string): void {
    const previousId = this.state.currentWorkshopId
    this.state.currentWorkshopId = workshopId
    this.emit({
      type: 'workshop_change',
      previousWorkshopId: previousId,
      currentWorkshopId: workshopId,
      timestamp: new Date(),
    })
  }

  public start(): void {
    if (this.state.isPlaying) return

    this.state.isPlaying = true
    this.state.isPaused = false
    this.state.pauseReason = null
    this.startTimer()
    this.emit({ type: 'play', timestamp: new Date() })
  }

  public stop(): void {
    this.state.isPlaying = false
    this.state.isPaused = false
    this.state.pauseReason = null
    this.stopTimer()
  }

  public pause(reason: PauseReason = 'manual'): void {
    if (!this.state.isPlaying || this.state.isPaused) return

    this.state.isPaused = true
    this.state.pauseReason = reason
    this.stopTimer()
    this.emit({ type: 'pause', pauseReason: reason, timestamp: new Date() })
  }

  public resume(): void {
    if (!this.state.isPlaying || !this.state.isPaused) return

    if (this.state.pauseReason === 'alarm' && this.hasActiveAnomalies()) {
      return
    }

    this.state.isPaused = false
    this.state.pauseReason = null
    this.startTimer()
    this.emit({ type: 'resume', timestamp: new Date() })
  }

  public setInterval(intervalMs: number): void {
    this.state.intervalMs = Math.max(1000, intervalMs)
    if (this.timer && this.state.isPlaying && !this.state.isPaused) {
      this.stopTimer()
      this.startTimer()
    }
    this.emit({ type: 'interval_change', timestamp: new Date() })
  }

  public getNextWorkshop(): string {
    const enabledWorkshops = this.state.workshops.filter(w => w.isEnabled)
    if (enabledWorkshops.length === 0) {
      return this.state.currentWorkshopId
    }

    const currentIndex = enabledWorkshops.findIndex(w => w.id === this.state.currentWorkshopId)
    const nextIndex = (currentIndex + 1) % enabledWorkshops.length
    return enabledWorkshops[nextIndex]?.id || this.state.currentWorkshopId
  }

  public getPreviousWorkshop(): string {
    const enabledWorkshops = this.state.workshops.filter(w => w.isEnabled)
    if (enabledWorkshops.length === 0) {
      return this.state.currentWorkshopId
    }

    const currentIndex = enabledWorkshops.findIndex(w => w.id === this.state.currentWorkshopId)
    const prevIndex = (currentIndex - 1 + enabledWorkshops.length) % enabledWorkshops.length
    return enabledWorkshops[prevIndex]?.id || this.state.currentWorkshopId
  }

  public next(): void {
    const nextId = this.getNextWorkshop()
    if (nextId !== this.state.currentWorkshopId) {
      this.setCurrentWorkshop(nextId)
    }
  }

  public previous(): void {
    const prevId = this.getPreviousWorkshop()
    if (prevId !== this.state.currentWorkshopId) {
      this.setCurrentWorkshop(prevId)
    }
  }

  public updateAnomaly(anomaly: WorkshopAnomaly): void {
    this.state.anomalies.set(anomaly.workshopId, anomaly)

    if (anomaly.isActive && this.state.isPlaying && !this.state.isPaused) {
      if (anomaly.severity === 'critical' || anomaly.severity === 'warning') {
        this.setCurrentWorkshop(anomaly.workshopId)
        this.pause('alarm')
      }
    }
  }

  public clearAnomaly(workshopId: string): void {
    this.state.anomalies.delete(workshopId)

    if (this.state.pauseReason === 'alarm' && !this.hasActiveAnomalies()) {
      setTimeout(() => {
        this.resume()
      }, this.config.autoResumeDelayMs)
    }
  }

  private hasActiveAnomalies(): boolean {
    for (const anomaly of this.state.anomalies.values()) {
      if (anomaly.isActive && (anomaly.severity === 'critical' || anomaly.severity === 'warning')) {
        return true
      }
    }
    return false
  }

  public getState(): Readonly<CarouselState> {
    return { ...this.state, anomalies: new Map(this.state.anomalies) }
  }

  public getActiveAnomalyWorkshops(): string[] {
    const result: string[] = []
    for (const [workshopId, anomaly] of this.state.anomalies.entries()) {
      if (anomaly.isActive) {
        result.push(workshopId)
      }
    }
    return result
  }

  public on(eventType: CarouselEventType, listener: (event: CarouselEvent) => void): void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set())
    }
    this.listeners.get(eventType)!.add(listener)
  }

  public off(eventType: CarouselEventType, listener: (event: CarouselEvent) => void): void {
    this.listeners.get(eventType)?.delete(listener)
  }

  private emit(event: CarouselEvent): void {
    const listeners = this.listeners.get(event.type)
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch (err) {
          console.error('Error in carousel event listener:', err)
        }
      }
    }
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => {
      if (!this.state.isPaused) {
        this.next()
      }
    }, this.state.intervalMs)
  }

  private stopTimer(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  public destroy(): void {
    this.stop()
    this.listeners.clear()
  }
}

export function createCarouselController(config?: CarouselControllerConfig): CarouselController {
  return new CarouselController(config)
}

export default CarouselController
