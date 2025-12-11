"use client"

/**
 * Browser-Based Test for 2 Users Spinning
 * 
 * This test runs directly in the browser and simulates 2 users
 * Perfect for quick verification without setting up test frameworks
 */

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"

interface TestState {
  user1: {
    id: string | null
    spinning: boolean
    matched: boolean
    matchId: string | null
    error: string | null
  }
  user2: {
    id: string | null
    spinning: boolean
    matched: boolean
    matchId: string | null
    error: string | null
  }
  testRunning: boolean
  logs: string[]
}

export default function BrowserTest() {
  const [state, setState] = useState<TestState>({
    user1: { id: null, spinning: false, matched: false, matchId: null, error: null },
    user2: { id: null, spinning: false, matched: false, matchId: null, error: null },
    testRunning: false,
    logs: [],
  })

  const addLog = (message: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, `${new Date().toLocaleTimeString()}: ${message}`],
    }))
    console.log(message)
  }

  const runTest = async () => {
    setState(prev => ({ ...prev, testRunning: true, logs: [] }))
    addLog("🚀 Starting browser-based 2-users test...")

    try {
      const supabase = createClient()

      // Get current user (this will be User 1)
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      if (authError || !user) {
        throw new Error(`Not authenticated: ${authError?.message}`)
      }

      setState(prev => ({
        ...prev,
        user1: { ...prev.user1, id: user.id },
      }))
      addLog(`✅ User 1 authenticated: ${user.id.substring(0, 8)}...`)

      // Step 1: User 1 spins
      addLog("📱 User 1: Pressing 'Start Spin'...")
      setState(prev => ({ ...prev, user1: { ...prev.user1, spinning: true } }))

      const spinResponse = await fetch('/api/spin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      if (!spinResponse.ok) {
        const errorData = await spinResponse.json()
        throw new Error(`Spin failed: ${errorData.error || spinResponse.statusText}`)
      }

      const spinData = await spinResponse.json()
      addLog(`✅ User 1: ${spinData.matched ? 'Matched!' : 'Joined queue'}`)

      if (spinData.matched) {
        setState(prev => ({
          ...prev,
          user1: {
            ...prev.user1,
            spinning: false,
            matched: true,
            matchId: spinData.match_id,
          },
        }))
        addLog(`🎉 Match created! Match ID: ${spinData.match_id}`)
      } else {
        // Wait for User 2 to spin (polling)
        addLog("⏳ Waiting for User 2 to spin...")
        let attempts = 0
        const maxAttempts = 15

        while (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000))
          attempts++

          const statusResponse = await fetch('/api/match/status', {
            cache: 'no-store',
          })
          const status = await statusResponse.json()

          if (status.match?.match_id) {
            setState(prev => ({
              ...prev,
              user1: {
                ...prev.user1,
                spinning: false,
                matched: true,
                matchId: status.match.match_id,
              },
            }))
            addLog(`✅ Match found! Match ID: ${status.match.match_id}`)
            addLog(`📊 Match status: ${status.match.status}`)
            break
          } else {
            addLog(`⏳ Attempt ${attempts}/${maxAttempts}: Still waiting... (state: ${status.state})`)
          }
        }
      }

      // Final verification
      const finalStatusResponse = await fetch('/api/match/status', {
        cache: 'no-store',
      })
      const finalStatus = await finalStatusResponse.json()

      if (finalStatus.match?.match_id) {
        addLog("✅ TEST PASSED: Match created successfully!")
        addLog(`✅ User 1 state: ${finalStatus.state}`)
        addLog(`✅ Match ID: ${finalStatus.match.match_id}`)
        addLog(`✅ Match status: ${finalStatus.match.status}`)
        addLog("")
        addLog("📝 Verification:")
        addLog("1. Check if you were redirected to /voting-window")
        addLog("2. Open another browser/incognito as User 2")
        addLog("3. User 2 should also see the match")
        addLog("4. Both should be able to acknowledge and vote")
      } else {
        addLog("❌ TEST FAILED: No match found")
      }

    } catch (error: any) {
      addLog(`❌ Test error: ${error.message}`)
      setState(prev => ({
        ...prev,
        user1: { ...prev.user1, error: error.message },
      }))
    } finally {
      setState(prev => ({ ...prev, testRunning: false }))
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white/10 backdrop-blur-lg rounded-2xl p-8 shadow-2xl">
          <h1 className="text-4xl font-bold text-white mb-2">Browser Test: 2 Users Spinning</h1>
          <p className="text-white/80 mb-4">Runs directly in browser - no test framework needed</p>
          <p className="text-yellow-300 text-sm mb-8">
            ⚠️ For full 2-user test: Open this page in 2 different browsers/incognito windows
          </p>

          <div className="mb-6">
            <button
              onClick={runTest}
              disabled={state.testRunning}
              className="px-6 py-3 bg-teal-500 hover:bg-teal-600 text-white font-semibold rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {state.testRunning ? "Running Test..." : "Run Test (User 1)"}
            </button>
          </div>

          <div className="mb-6 bg-white/5 rounded-lg p-6">
            <h2 className="text-2xl font-bold text-white mb-4">Test Status</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-teal-300 mb-2">User 1</h3>
                <div className="text-white/80 space-y-1 font-mono text-sm">
                  <p>ID: {state.user1.id ? `${state.user1.id.substring(0, 8)}...` : 'Not set'}</p>
                  <p>Spinning: {state.user1.spinning ? '✅ Yes' : '❌ No'}</p>
                  <p>Matched: {state.user1.matched ? '✅ Yes' : '❌ No'}</p>
                  <p>Match ID: {state.user1.matchId || 'none'}</p>
                  {state.user1.error && (
                    <p className="text-red-400">Error: {state.user1.error}</p>
                  )}
                </div>
              </div>
            </div>
          </div>

          {state.logs.length > 0 && (
            <div className="bg-black/30 rounded-lg p-6">
              <h2 className="text-xl font-bold text-white mb-4">Test Logs</h2>
              <div className="space-y-1 font-mono text-sm text-white/80 max-h-96 overflow-y-auto">
                {state.logs.map((log, index) => (
                  <div key={index} className="whitespace-pre-wrap">{log}</div>
                ))}
              </div>
            </div>
          )}

          <div className="mt-8 bg-blue-500/20 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-white mb-2">How to Test 2 Users:</h3>
            <ol className="text-white/80 space-y-2 list-decimal list-inside">
              <li>Open this page in <strong>Browser Tab 1</strong> (User 1)</li>
              <li>Open <code className="bg-black/30 px-2 py-1 rounded">/spin</code> in <strong>Browser Tab 2</strong> (User 2 - different browser/incognito)</li>
              <li>Log in as User 2 in Tab 2</li>
              <li>In Tab 1, click "Run Test" - this makes User 1 spin</li>
              <li>In Tab 2, manually press "Start Spin"</li>
              <li>Watch both tabs - they should redirect to <code className="bg-black/30 px-2 py-1 rounded">/voting-window</code></li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  )
}







