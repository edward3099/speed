'use client'

/**
 * Admin Queue Dashboard
 * 
 * Real-time monitoring of queue health, gender distribution, and match rates
 * Access: Admin only (requires authentication + admin key)
 */

import { useEffect, useState } from 'react'
import { BarChart3, Users, Clock, TrendingUp, AlertTriangle, RefreshCw } from 'lucide-react'

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
    other: number
    unknown: number
    ratio: string
  }
  estimatedWaitTimes: {
    male: number
    female: number
  }
  matchRate: {
    matchesLastHour: number
    matchesPerMinute: string
  }
  health: {
    status: 'healthy' | 'warning' | 'critical'
    message: string
  }
  timestamp: string
}

export default function QueueDashboard() {
  const [stats, setStats] = useState<QueueStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const fetchStats = async () => {
    try {
      const response = await fetch('/api/admin/queue-stats', {
        cache: 'no-store',
        headers: {
          'x-admin-key': process.env.NEXT_PUBLIC_ADMIN_KEY || '',
        },
      })

      if (!response.ok) {
        if (response.status === 403) {
          setError('Admin access required')
        } else {
          setError('Failed to fetch queue stats')
        }
        return
      }

      const data = await response.json()
      setStats(data)
      setError(null)
    } catch (err) {
      console.error('Error fetching queue stats:', err)
      setError('Unable to load queue statistics')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchStats()
    
    if (autoRefresh) {
      const interval = setInterval(fetchStats, 10000) // Refresh every 10 seconds
      return () => clearInterval(interval)
    }
  }, [autoRefresh])

  const formatTime = (seconds: number) => {
    if (seconds < 60) return `${Math.round(seconds)}s`
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`
    const hours = Math.floor(seconds / 3600)
    const mins = Math.round((seconds % 3600) / 60)
    return `${hours}h ${mins}m`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'critical': return 'text-red-600 bg-red-50 border-red-200'
      case 'warning': return 'text-amber-600 bg-amber-50 border-amber-200'
      default: return 'text-green-600 bg-green-50 border-green-200'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <RefreshCw className="w-8 h-8 animate-spin text-gray-400" />
            <span className="ml-3 text-gray-600">Loading queue statistics...</span>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-7xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-6 h-6 text-red-600" />
              <div>
                <h3 className="text-lg font-semibold text-red-900">Error</h3>
                <p className="text-red-700">{error}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  if (!stats) {
    return null
  }

  const genderRatio = parseFloat(stats.genderDistribution.ratio) || 0
  const isImbalanced = genderRatio > 5 || genderRatio < 0.2

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Queue Dashboard</h1>
            <p className="text-gray-600 mt-1">
              Last updated: {new Date(stats.timestamp).toLocaleString()}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                className="rounded"
              />
              Auto-refresh (10s)
            </label>
            <button
              onClick={fetchStats}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </div>

        {/* Health Status */}
        <div className={`border rounded-lg p-6 ${getStatusColor(stats.health.status)}`}>
          <div className="flex items-start gap-3">
            {stats.health.status === 'critical' && <AlertTriangle className="w-6 h-6 flex-shrink-0" />}
            <div>
              <h3 className="text-lg font-semibold mb-1">System Health</h3>
              <p className="text-sm opacity-90">{stats.health.message}</p>
            </div>
          </div>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total in Queue</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">{stats.queue.total}</p>
              </div>
              <Users className="w-8 h-8 text-blue-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg Wait Time</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {formatTime(stats.queue.averageWaitSeconds)}
                </p>
              </div>
              <Clock className="w-8 h-8 text-amber-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Matches/Hour</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.matchRate.matchesLastHour}
                </p>
              </div>
              <TrendingUp className="w-8 h-8 text-green-500" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Waiting &gt;60s</p>
                <p className="text-3xl font-bold text-gray-900 mt-2">
                  {stats.queue.usersWaitingOver60s}
                </p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
          </div>
        </div>

        {/* Gender Distribution */}
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
            <BarChart3 className="w-5 h-5" />
            Gender Distribution
          </h2>
          
          {isImbalanced && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-900">Gender Imbalance Detected</p>
                  <p className="text-sm text-amber-700 mt-1">
                    Ratio: {stats.genderDistribution.ratio}:1. This may cause longer wait times for the majority gender.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-gray-600">Male</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">
                {stats.genderDistribution.male}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Est. wait: {stats.estimatedWaitTimes.male > 0 
                  ? `${stats.estimatedWaitTimes.male} min`
                  : 'N/A'}
              </p>
            </div>

            <div className="text-center p-4 bg-pink-50 rounded-lg">
              <p className="text-sm text-gray-600">Female</p>
              <p className="text-2xl font-bold text-pink-600 mt-1">
                {stats.genderDistribution.female}
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Est. wait: {stats.estimatedWaitTimes.female > 0 
                  ? `${stats.estimatedWaitTimes.female} min`
                  : 'N/A'}
              </p>
            </div>

            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600">Other</p>
              <p className="text-2xl font-bold text-purple-600 mt-1">
                {stats.genderDistribution.other}
              </p>
            </div>

            <div className="text-center p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-600">Unknown</p>
              <p className="text-2xl font-bold text-gray-600 mt-1">
                {stats.genderDistribution.unknown}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t">
            <p className="text-sm text-gray-600">
              <strong>Ratio:</strong> {stats.genderDistribution.ratio !== 'N/A' 
                ? `${stats.genderDistribution.ratio}:1 (male:female)`
                : 'N/A'}
            </p>
          </div>
        </div>

        {/* Recommendations */}
        {isImbalanced && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Recommendations</h2>
            <ul className="space-y-2 text-gray-700">
              <li className="flex items-start gap-2">
                <span className="text-amber-600 mt-1">•</span>
                <span>Focus user acquisition on underrepresented gender ({stats.genderDistribution.male > stats.genderDistribution.female ? 'female' : 'male'})</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600 mt-1">•</span>
                <span>Consider showing wait time expectations to users based on gender</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-600 mt-1">•</span>
                <span>Monitor match rate - current: {stats.matchRate.matchesPerMinute} matches/minute</span>
              </li>
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}



