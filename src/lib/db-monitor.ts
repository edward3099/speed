/**
 * Database Connection Monitor
 * 
 * Monitors database connection usage to help identify bottlenecks
 * Critical for supporting 500+ concurrent users
 */

import { getPooledServiceClient } from './supabase/pooled-client'

export interface ConnectionStats {
  activeConnections: number
  idleConnections: number
  totalConnections: number
  maxConnections: number
  connectionUtilization: number
  timestamp: string
}

/**
 * Get current database connection statistics
 */
export async function getConnectionStats(): Promise<ConnectionStats | null> {
  try {
    const supabase = getPooledServiceClient()
    
    // Get connection stats
    const { data, error } = await supabase.rpc('get_connection_stats', {})
    
    if (error) {
      // Fallback: try direct query if RPC doesn't exist
      const { data: queryData, error: queryError } = await supabase
        .from('pg_stat_activity')
        .select('*')
        .limit(1)
      
      if (queryError) {
        console.warn('Could not get connection stats:', queryError.message)
        return null
      }
      
      // Return basic stats
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        maxConnections: 60, // Default Supabase limit
        connectionUtilization: 0,
        timestamp: new Date().toISOString(),
      }
    }
    
    return data as ConnectionStats
  } catch (error: any) {
    console.warn('Error getting connection stats:', error.message)
    return null
  }
}

/**
 * Check if database connections are approaching limit
 */
export async function isConnectionPoolStressed(): Promise<boolean> {
  const stats = await getConnectionStats()
  if (!stats) {
    return false
  }
  
  // Consider stressed if utilization > 80%
  return stats.connectionUtilization > 0.8
}
