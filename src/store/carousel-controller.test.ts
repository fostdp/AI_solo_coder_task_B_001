import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { CarouselController, createCarouselController, type WorkshopConfig } from './carousel-controller.js'

describe('CarouselController', () => {
  let controller: CarouselController
  const workshops: WorkshopConfig[] = [
    { id: 'WS-001', name: '一车间', description: '', displayOrder: 1, isEnabled: true },
    { id: 'WS-002', name: '二车间', description: '', displayOrder: 2, isEnabled: true },
    { id: 'WS-003', name: '三车间', description: '', displayOrder: 3, isEnabled: true },
  ]

  beforeEach(() => {
    controller = createCarouselController({ defaultIntervalMs: 1000, autoResumeDelayMs: 100 })
    controller.setWorkshops(workshops)
    controller.setCurrentWorkshop('WS-001')
  })

  afterEach(() => {
    controller.destroy()
  })

  describe('基本功能测试', () => {
    it('应该能够创建轮播控制器实例', () => {
      expect(controller).toBeInstanceOf(CarouselController)
    })

    it('应该能够设置车间列表', () => {
      const state = controller.getState()
      expect(state.workshops.length).toBe(3)
    })

    it('应该能够设置当前车间', () => {
      controller.setCurrentWorkshop('WS-002')
      expect(controller.getState().currentWorkshopId).toBe('WS-002')
    })

    it('应该能够获取当前状态', () => {
      const state = controller.getState()
      expect(state.isPlaying).toBe(false)
      expect(state.isPaused).toBe(false)
      expect(state.currentWorkshopId).toBe('WS-001')
    })
  })

  describe('车间切换测试', () => {
    it('应该能够获取下一个车间', () => {
      expect(controller.getNextWorkshop()).toBe('WS-002')
    })

    it('应该能够循环切换到第一个车间', () => {
      controller.setCurrentWorkshop('WS-003')
      expect(controller.getNextWorkshop()).toBe('WS-001')
    })

    it('应该能够获取上一个车间', () => {
      controller.setCurrentWorkshop('WS-002')
      expect(controller.getPreviousWorkshop()).toBe('WS-001')
    })

    it('应该能够循环切换到最后一个车间', () => {
      expect(controller.getPreviousWorkshop()).toBe('WS-003')
    })

    it('next方法应该切换到下一个车间', () => {
      controller.next()
      expect(controller.getState().currentWorkshopId).toBe('WS-002')
    })

    it('previous方法应该切换到上一个车间', () => {
      controller.previous()
      expect(controller.getState().currentWorkshopId).toBe('WS-003')
    })

    it('只切换到启用的车间', () => {
      controller.setWorkshops([
        { ...workshops[0] },
        { ...workshops[1], isEnabled: false },
        { ...workshops[2] },
      ])
      controller.setCurrentWorkshop('WS-001')
      expect(controller.getNextWorkshop()).toBe('WS-003')
    })

    it('没有启用的车间时不应该切换', () => {
      controller.setWorkshops(workshops.map(w => ({ ...w, isEnabled: false })))
      controller.setCurrentWorkshop('WS-001')
      expect(controller.getNextWorkshop()).toBe('WS-001')
      expect(controller.getPreviousWorkshop()).toBe('WS-001')
    })
  })

  describe('播放控制测试', () => {
    it('start方法应该开始轮播', () => {
      controller.start()
      expect(controller.getState().isPlaying).toBe(true)
      expect(controller.getState().isPaused).toBe(false)
    })

    it('stop方法应该停止轮播', () => {
      controller.start()
      controller.stop()
      expect(controller.getState().isPlaying).toBe(false)
    })

    it('pause方法应该暂停轮播', () => {
      controller.start()
      controller.pause('manual')
      expect(controller.getState().isPaused).toBe(true)
      expect(controller.getState().pauseReason).toBe('manual')
    })

    it('resume方法应该恢复轮播', () => {
      controller.start()
      controller.pause('manual')
      controller.resume()
      expect(controller.getState().isPaused).toBe(false)
      expect(controller.getState().pauseReason).toBeNull()
    })

    it('未播放时pause应该无效', () => {
      controller.pause('manual')
      expect(controller.getState().isPlaying).toBe(false)
    })

    it('未暂停时resume应该无效', () => {
      controller.start()
      const stateBefore = controller.getState()
      controller.resume()
      expect(controller.getState().isPaused).toBe(stateBefore.isPaused)
    })

    it('重复start应该无效', () => {
      controller.start()
      const stateBefore = controller.getState()
      controller.start()
      expect(controller.getState().isPlaying).toBe(stateBefore.isPlaying)
    })
  })

  describe('间隔设置测试', () => {
    it('应该能够设置轮播间隔', () => {
      controller.setInterval(5000)
      expect(controller.getState().intervalMs).toBe(5000)
    })

    it('间隔应该有最小值限制', () => {
      controller.setInterval(500)
      expect(controller.getState().intervalMs).toBe(1000)
    })
  })

  describe('异常时停驻测试', () => {
    it('critical异常时应该暂停并切换到异常车间', () => {
      controller.start()
      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'critical',
      })

      expect(controller.getState().isPaused).toBe(true)
      expect(controller.getState().pauseReason).toBe('alarm')
      expect(controller.getState().currentWorkshopId).toBe('WS-002')
    })

    it('warning异常时应该暂停并切换到异常车间', () => {
      controller.start()
      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'warning',
      })

      expect(controller.getState().isPaused).toBe(true)
      expect(controller.getState().pauseReason).toBe('alarm')
      expect(controller.getState().currentWorkshopId).toBe('WS-002')
    })

    it('info异常时不应该暂停', () => {
      controller.start()
      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'info',
      })

      expect(controller.getState().isPaused).toBe(false)
    })

    it('未播放时异常不应该暂停', () => {
      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'critical',
      })

      expect(controller.getState().isPlaying).toBe(false)
    })

    it('已暂停时异常不应该重复暂停', () => {
      controller.start()
      controller.pause('manual')
      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'critical',
      })

      expect(controller.getState().pauseReason).toBe('manual')
    })
  })

  describe('异常消除后恢复测试', () => {
    it('最后一个异常消除后应该自动恢复', async () => {
      controller.start()
      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'critical',
      })

      expect(controller.getState().isPaused).toBe(true)

      controller.clearAnomaly('WS-002')

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(controller.getState().isPaused).toBe(false)
    })

    it('还有其他异常时不应该恢复', async () => {
      controller.start()
      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'critical',
      })
      controller.updateAnomaly({
        workshopId: 'WS-003',
        isActive: true,
        severity: 'warning',
      })

      controller.clearAnomaly('WS-002')

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(controller.getState().isPaused).toBe(true)
    })

    it('手动暂停后异常消除不应该自动恢复', async () => {
      controller.start()
      controller.pause('manual')

      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'critical',
      })
      controller.clearAnomaly('WS-002')

      await new Promise(resolve => setTimeout(resolve, 200))

      expect(controller.getState().isPaused).toBe(true)
      expect(controller.getState().pauseReason).toBe('manual')
    })
  })

  describe('事件监听测试', () => {
    it('应该触发workshop_change事件', () => {
      const listener = vi.fn()
      controller.on('workshop_change', listener)

      controller.setCurrentWorkshop('WS-002')

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'workshop_change',
          previousWorkshopId: 'WS-001',
          currentWorkshopId: 'WS-002',
        })
      )
    })

    it('应该触发play事件', () => {
      const listener = vi.fn()
      controller.on('play', listener)

      controller.start()

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'play' })
      )
    })

    it('应该触发pause事件', () => {
      const listener = vi.fn()
      controller.on('pause', listener)

      controller.start()
      controller.pause('manual')

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'pause', pauseReason: 'manual' })
      )
    })

    it('应该触发resume事件', () => {
      const listener = vi.fn()
      controller.on('resume', listener)

      controller.start()
      controller.pause('manual')
      controller.resume()

      expect(listener).toHaveBeenCalledTimes(1)
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'resume' })
      )
    })

    it('应该能够移除监听器', () => {
      const listener = vi.fn()
      controller.on('play', listener)
      controller.off('play', listener)

      controller.start()

      expect(listener).not.toHaveBeenCalled()
    })

    it('监听器错误不应该影响其他逻辑', () => {
      const badListener = vi.fn(() => { throw new Error('Test error') })
      const goodListener = vi.fn()

      controller.on('play', badListener)
      controller.on('play', goodListener)

      expect(() => controller.start()).not.toThrow()
      expect(goodListener).toHaveBeenCalled()
    })
  })

  describe('活跃异常车间测试', () => {
    it('应该能够获取所有活跃异常的车间', () => {
      controller.updateAnomaly({
        workshopId: 'WS-001',
        isActive: true,
        severity: 'warning',
      })
      controller.updateAnomaly({
        workshopId: 'WS-002',
        isActive: true,
        severity: 'critical',
      })
      controller.updateAnomaly({
        workshopId: 'WS-003',
        isActive: false,
        severity: 'warning',
      })

      const activeWorkshops = controller.getActiveAnomalyWorkshops()
      expect(activeWorkshops).toContain('WS-001')
      expect(activeWorkshops).toContain('WS-002')
      expect(activeWorkshops).not.toContain('WS-003')
      expect(activeWorkshops.length).toBe(2)
    })
  })

  describe('销毁测试', () => {
    it('destroy应该停止轮播并清除所有监听器', () => {
      const listener = vi.fn()
      controller.on('play', listener)

      controller.start()
      controller.destroy()

      expect(controller.getState().isPlaying).toBe(false)

      controller.start()
      expect(listener).toHaveBeenCalledTimes(1)
    })
  })

  describe('边界条件测试', () => {
    it('空车间列表应该正常处理', () => {
      controller.setWorkshops([])
      expect(() => controller.getNextWorkshop()).not.toThrow()
      expect(() => controller.getPreviousWorkshop()).not.toThrow()
    })

    it('设置当前车间到不存在的ID应该正常处理', () => {
      expect(() => controller.setCurrentWorkshop('NON_EXISTENT')).not.toThrow()
      expect(controller.getState().currentWorkshopId).toBe('NON_EXISTENT')
    })
  })
})
