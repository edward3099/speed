/**
 * System Monitor
 * 
 * Monitors system health and provides metrics for adaptive throttling
 * Designed to help scale to thousands of concurrent users
 */

import os from 'os'

export interface SystemHealth {
  cpu: {
    load: number[]
    utilization: number
    cores: number
  }
  memory: {
    total: number
    free: number
    used: number
    usagePercent: number
  }
  uptime: number
  healthy: boolean
}

/**
 * Get current system health metrics
 */
export function getSystemHealth(): SystemHealth {
  const loadAvg = os.loadavg()
  const cpus = os.cpus()
  const totalMem = os.totalmem()
  const freeMem = os.freemem()
  const usedMem = totalMem - freeMem
  const memUsagePercent = (usedMem / totalMem) * 100
  
  // Calculate CPU utilization from load average
  // Load average / number of cores gives approximate CPU utilization
  const cpuUtilization = (loadAvg[0] / cpus.length) * 100

  // System is healthy if:
  // - CPU utilization < 80%
  // - Memory usage < 85%
  const healthy = cpuUtilization < 80 && memUsagePercent < 85

  return {
    cpu: {
      load: loadAvg,
      utilization: cpuUtilization,
      cores: cpus.length,
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: usedMem,
      usagePercent: memUsagePercent,
    },
    uptime: os.uptime(),
    healthy,
  }
}

/**
 * Get system health as a simple score (0-100)
 * Higher score = better health
 */
export function getSystemHealthScore(): number {
  const health = getSystemHealth()
  
  // Calculate score based on CPU and memory
  const cpuScore = Math.max(0, 100 - health.cpu.utilization)
  const memScore = Math.max(0, 100 - health.memory.usagePercent)
  
  // Average of CPU and memory scores
  return (cpuScore + memScore) / 2
}


