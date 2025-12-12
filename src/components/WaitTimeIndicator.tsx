'use client'

import { useEffect, useState } from 'react'
import { Clock, Users, AlertCircle, Info } from 'lucide-react'

interface QueueStats {
  queue: {
    total: number
    averageWaitSeconds: number
    maxWaitSeconds: number
    usersWaitingOver60s: number
  }
  genderDistribution: {
    male: number
    female: number
    ratio: string
  }
  estimatedWaitTimes: {
    male: number
    female: number
  }
  matchRate?: {
    matchesLastHour: number
    matchesPerMinute: string
  }
  health: {
    status: 'healthy' | 'warning' | 'critical'
    message: string
  }
}

interface WaitTimeIndicatorProps {
  userGender?: 'male' | 'female' | 'other'
  className?: string
}

export function WaitTimeIndicator({ userGender, className = '' }: WaitTimeIndicatorProps) {
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const response = await fetch('/api/admin/queue-stats', {
          cache: 'no-store',
        })

        if (!response.ok) {
          throw new Error('Failed to fetch queue stats')
        }

        const data = await response.json()
        setStats(data)
        setError(null)
      } catch (err) {
        console.error('Error fetching queue stats:', err)
        setError('Unable to load queue information')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
    // Refresh every 30 seconds
    const interval = setInterval(fetchStats, 30000)

    return () => clearInterval(interval)
  }, [])

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-gray-500 ${className}`}>
        <Clock className="w-4 h-4 animate-spin" />
        <span>Loading queue status...</span>
      </div>
    )
  }

  if (error || !stats) {
    return (
      <div className={`flex items-center gap-2 text-sm text-amber-600 ${className}`}>
        <AlertCircle className="w-4 h-4" />
        <span>{error || 'Unable to load queue information'}</span>
      </div>
    )
  }

  const estimatedWait = userGender && userGender !== 'other'
    ? stats.estimatedWaitTimes[userGender]
    : Math.round(stats.queue.averageWaitSeconds / 60)

  const formatWaitTime = (minutes: number) => {
    if (minutes < 0) return 'Unable to estimate'
    if (minutes < 1) return 'Less than 1 minute'
    if (minutes < 60) return `~${Math.round(minutes)} minutes`
    const hours = Math.floor(minutes / 60)
    const mins = Math.round(minutes % 60)
    return `${hours}h ${mins}m`
  }

  const getStatusColor = () => {
    if (stats.health.status === 'critical') return 'text-red-600'
    if (stats.health.status === 'warning') return 'text-amber-600'
    return 'text-green-600'
  }

  const getStatusIcon = () => {
    if (stats.health.status === 'critical') return AlertCircle
    if (stats.health.status === 'warning') return AlertCircle
    return Info
  }

  const StatusIcon = getStatusIcon()

  return (
    <div className={`space-y-2 ${className}`}>
      {/* Estimated Wait Time */}
      <div className="flex items-center gap-2 text-sm">
        <Clock className="w-4 h-4 text-gray-500" />
        <span className="text-gray-700">
          Estimated wait time: <strong className={estimatedWait > 30 ? 'text-amber-600' : 'text-gray-900'}>
            {formatWaitTime(estimatedWait)}
          </strong>
        </span>
      </div>

      {/* Queue Status */}
      <div className="flex items-center gap-2 text-sm">
        <Users className="w-4 h-4 text-gray-500" />
        <span className="text-gray-700">
          {stats.queue.total} {stats.queue.total === 1 ? 'person' : 'people'} in queue
        </span>
      </div>

      {/* Health Status */}
      {stats.health.status !== 'healthy' && (
        <div className={`flex items-start gap-2 text-sm ${getStatusColor()}`}>
          <StatusIcon className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="font-medium">{stats.health.message}</p>
            {stats.genderDistribution.ratio !== 'N/A' && parseFloat(stats.genderDistribution.ratio) > 5 && (
              <p className="text-xs mt-1 opacity-90">
                There are currently more {stats.genderDistribution.male > stats.genderDistribution.female ? 'males' : 'females'} waiting than {stats.genderDistribution.male > stats.genderDistribution.female ? 'females' : 'males'}, which may increase wait times.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Why Am I Waiting? */}
      <details className="text-xs text-gray-600 mt-2">
        <summary className="cursor-pointer hover:text-gray-800">
          Why am I waiting?
        </summary>
        <div className="mt-2 pl-4 space-y-1">
          <p>• We match people based on gender preferences</p>
          <p>• Wait times depend on how many people of the opposite gender are available</p>
          <p>• Current ratio: {stats.genderDistribution.ratio !== 'N/A' ? `${stats.genderDistribution.ratio}:1` : 'N/A'}</p>
          <p>• Match rate: {stats.matchRate?.matchesPerMinute || '0'} matches per minute</p>
        </div>
      </details>
    </div>
  )
}



