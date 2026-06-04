import { WebSocketServer, WebSocket } from 'ws'
import { createServer } from 'http'
import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'

import { createLineDataCollector, type SensorReading } from './modules/line-data-collector.js'
import { createDynamicRatingEngine } from './modules/dynamic-rating-engine.js'
import { createLineAlarmProcessor, type Alarm } from './modules/line-alarm-processor.js'
import { createGridStatePusher } from './modules/grid-state-pusher.js'
import { createPredictEngine, type SensorPrediction } from './modules/predict-engine.js'
import { createCorrelationAnalyzer } from './modules/correlation-analyzer.js'
import { createStreamingDataExporter, type ExportOptions } from './modules/streaming-data-exporter.js'
import { generateReadings } from './sensor-simulator.js'
import { getEnabledWorkshops } from '../config/workshops.js'

const OFFLINE_CHECK_INTERVAL_MS = 30 * 1000
const SENSOR_REPORT_INTERVAL_MS = 10 * 1000
const CAPACITY_CALC_INTERVAL_MS = 10 * 1000
const PREDICTION_INTERVAL_MS = 30 * 1000
const WORKSHOP_STATUS_INTERVAL_MS = 5 * 1000

const dataCollector = createLineDataCollector({
  persistToDb: true,
  batchSize: 540,
  batchTimeoutMs: 5000,
})

const ratingEngine = createDynamicRatingEngine({
  globalStaticCapacity: Number(process.env.STATIC_CAPACITY || 1000),
  maxAllowedTemp: Number(process.env.MAX_ALLOWED_TEMP || 70),
  persistResults: true,
})

const alarmProcessor = createLineAlarmProcessor({
  maxAllowedTemp: Number(process.env.MAX_ALLOWED_TEMP || 70),
  offlineThresholdMs: 5 * 60 * 1000,
  overheatDurationMs: 5 * 60 * 1000,
  baseGallopingWindThreshold: 30,
})

const predictEngine = createPredictEngine({
  historyWindowMinutes: 30,
  predictionHorizonMinutes: 5,
  warningThresholdPercent: 80,
  minDataPoints: 6,
})

const correlationAnalyzer = createCorrelationAnalyzer()

const dataExporter = createStreamingDataExporter()

const pusher = createGridStatePusher({
  throttleMs: 0,
  maxQueueSize: 1000,
  enableQos: true,
})

pusher.setDataCollector(dataCollector)

const wss = new WebSocketServer({ noServer: true })

const sensors = dataCollector.getAllSensorData()
const initialReadings: SensorReading[] = Array.from(sensors.entries()).map(([id, data]) => ({
  id,
  type: 'temperature' as const,
  value: data.value,
  timestamp: data.timestamp,
}))

void dataCollector.ingest(initialReadings)

dataCollector.onData(async (readings, aggregated) => {
  pusher.broadcastSensorData(readings)

  for (const reading of readings) {
    predictEngine.addSensorData(reading.id, reading.value, new Date(reading.timestamp))

    const allData = dataCollector.getAllSensorData()
    const alarm = await alarmProcessor.processSensorReading(
      reading.id,
      reading.value,
      new Date(reading.timestamp),
      allData,
    )

    if (alarm) {
      pusher.broadcastAlarm(alarm)
      correlationAnalyzer.registerAlarm(reading.id, alarm.alarmType)

      const workshopAnomaly = correlationAnalyzer.getWorkshopAnomaly(
        alarm.sensorId.startsWith('T0') ? 'WS-001' : 
        alarm.sensorId.startsWith('T002') ? 'WS-002' : 'WS-003'
      )
      if (workshopAnomaly) {
        pusher.broadcastWorkshopAnomaly(workshopAnomaly)
      }
    }
  }
})

ratingEngine.onRatingUpdate((result) => {
  pusher.broadcastCapacity(result)
})

alarmProcessor.onAlarm((alarm) => {
  pusher.broadcastAlarm(alarm)
})

alarmProcessor.onClearAlarm((alarm) => {
  correlationAnalyzer.clearAlarm(alarm.sensorId, alarm.alarmType)
})

function setupUpgrade(server: ReturnType<typeof createServer>): void {
  server.on('upgrade', (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    if (request.url === '/ws') {
      wss.handleUpgrade(request, socket, head, (ws: WebSocket) => {
        handleNewConnection(ws, request)
      })
    }
  })
}

function handleNewConnection(ws: WebSocket, request: IncomingMessage): void {
  const clientId = pusher.addClient(ws)
  console.log(`New WebSocket client connected: ${clientId}`)

  ws.send(JSON.stringify({ type: 'connection_established', clientId }))

  void pusher.sendInitialData(clientId)

  setImmediate(async () => {
    const allData = dataCollector.getAllSensorData()
    const ratingResult = await ratingEngine.calculateLineRating(allData)
    pusher.broadcastCapacityInitial({
      dynamicCapacity: ratingResult.globalRating.dynamicCapacity,
      staticCapacity: ratingResult.globalRating.staticCapacity,
      marginPercent: ratingResult.globalRating.marginPercent,
      maxSafeTemp: ratingResult.globalRating.maxSafeTemp,
      cloudCoverFactor: ratingResult.globalRating.cloudCoverFactor,
      effectiveIrradiance: ratingResult.globalRating.effectiveIrradiance,
      timestamp: ratingResult.timestamp.toISOString(),
    })

    pusher.broadcastAllWorkshopStatuses(correlationAnalyzer.getAllWorkshopStatuses())
  })

  ws.on('message', async (data) => {
    try {
      const message = JSON.parse(data.toString())
      await handleClientRequest(clientId, message)
    } catch (err) {
      console.error('Error parsing client message:', err)
    }
  })

  ws.on('close', () => {
    console.log(`WebSocket client disconnected: ${clientId}`)
  })
}

async function handleClientRequest(clientId: string, message: { type: string; [key: string]: unknown }): Promise<void> {
  switch (message.type) {
    case 'export_request':
      await handleExportRequest(clientId, message as unknown as {
        exportType: string
        startTime: string
        endTime: string
        workshopIds?: string[]
        sensorTypes?: string[]
      })
      break
    case 'get_workshop_statuses':
      pusher.broadcastAllWorkshopStatuses(correlationAnalyzer.getAllWorkshopStatuses())
      break
    case 'get_predictions':
      const predictions = predictEngine.predictAll()
      pusher.broadcastAll('prediction', { type: 'batch', data: predictions })
      break
  }
}

async function handleExportRequest(clientId: string, message: {
  exportType: string
  startTime: string
  endTime: string
  workshopIds?: string[]
  sensorTypes?: string[]
}): Promise<void> {
  const options: ExportOptions = {
    startTime: new Date(message.startTime),
    endTime: new Date(message.endTime),
    workshopIds: message.workshopIds,
    sensorTypes: message.sensorTypes as any,
    format: 'csv',
  }

  const validation = dataExporter.validateExportOptions(options)
  if (!validation.valid) {
    pusher.broadcastAll('export_response', {
      success: false,
      error: validation.errors.join(', '),
    })
    return
  }

  let result
  switch (message.exportType) {
    case 'sensor':
      result = await dataExporter.exportSensorData(options)
      break
    case 'alarm':
      result = await dataExporter.exportAlarmData(options)
      break
    case 'combined':
      result = await dataExporter.exportCombinedData(options)
      break
    default:
      result = { success: false, error: 'Invalid export type', filename: '', data: '', recordCount: 0, sizeBytes: 0 }
  }

  pusher.broadcastAll('export_response', result)
}

async function startSensorSimulation(): Promise<void> {
  console.log('Starting sensor simulation...')

  const sendSensorData = async () => {
    const readings = generateReadings()
    try {
      await dataCollector.ingest(readings)
    } catch (err) {
      console.error('Error ingesting sensor readings:', err)
    }
  }

  await sendSensorData()
  setInterval(sendSensorData, SENSOR_REPORT_INTERVAL_MS)
}

async function startCapacityCalculation(): Promise<void> {
  console.log('Starting capacity calculation engine...')

  const calculate = async () => {
    try {
      const allData = dataCollector.getAllSensorData()
      await ratingEngine.calculateLineRating(allData)
    } catch (err) {
      console.error('Error calculating line rating:', err)
    }
  }

  setTimeout(calculate, 2000)
  setInterval(calculate, CAPACITY_CALC_INTERVAL_MS)
}

function startOfflineMonitoring(): void {
  console.log('Starting offline sensor monitoring...')

  const check = async () => {
    try {
      const newOfflineAlarms = await alarmProcessor.checkOfflineSensors()
      for (const alarm of newOfflineAlarms) {
        pusher.broadcastAlarm(alarm)
        correlationAnalyzer.registerAlarm(alarm.sensorId, alarm.alarmType)
      }
    } catch (err) {
      console.error('Error checking offline sensors:', err)
    }
  }

  setInterval(check, OFFLINE_CHECK_INTERVAL_MS)
}

function startPredictionEngine(): void {
  console.log('Starting alarm prediction engine...')

  const predict = () => {
    try {
      const workshops = getEnabledWorkshops()
      for (const workshop of workshops) {
        const prediction = predictEngine.predictForWorkshop(workshop.id)
        if (prediction.atRiskCount > 0) {
          pusher.broadcastWorkshopPrediction(prediction)
        }
      }

      const warnings = predictEngine.getWarnings()
      for (const warning of warnings.slice(0, 10)) {
        pusher.broadcastPrediction(warning)
      }
    } catch (err) {
      console.error('Error running prediction:', err)
    }
  }

  setInterval(predict, PREDICTION_INTERVAL_MS)
}

function startWorkshopStatusBroadcast(): void {
  console.log('Starting workshop status broadcast...')

  const broadcast = () => {
    try {
      const statuses = correlationAnalyzer.getAllWorkshopStatuses()
      pusher.broadcastAllWorkshopStatuses(statuses)
    } catch (err) {
      console.error('Error broadcasting workshop status:', err)
    }
  }

  setInterval(broadcast, WORKSHOP_STATUS_INTERVAL_MS)
}

function start(): void {
  dataCollector.start()
  void startSensorSimulation()
  void startCapacityCalculation()
  startOfflineMonitoring()
  startPredictionEngine()
  startWorkshopStatusBroadcast()
  console.log('WebSocket server module system initialized with all features')
}

function stop(): void {
  dataCollector.stop()
  pusher.disconnectAll()
  alarmProcessor.removeAllListeners()
  ratingEngine.removeAllListeners()
  console.log('WebSocket server module system stopped')
}

function getModules() {
  return {
    dataCollector,
    ratingEngine,
    alarmProcessor,
    predictEngine,
    correlationAnalyzer,
    dataExporter,
    pusher,
  }
}

export { setupUpgrade, start, stop, getModules, wss }
