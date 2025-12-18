/**
 * TEST ENDPOINT: Test Telegram notifications
 * Use this to verify Telegram is working
 * GET /api/admin/test-telegram
 */

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const revalidate = 0

export async function GET(request: NextRequest) {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  // Check if credentials are set
  if (!botToken || !chatId) {
    return NextResponse.json({
      success: false,
      error: 'Telegram credentials not configured',
      hasBotToken: !!botToken,
      hasChatId: !!chatId,
      botTokenPrefix: botToken ? botToken.substring(0, 10) + '...' : 'missing',
      chatId: chatId || 'missing',
      envCheck: {
        nodeEnv: process.env.NODE_ENV,
        allEnvKeys: Object.keys(process.env).filter(k => k.includes('TELEGRAM'))
      }
    }, { status: 500 })
  }

  // Try to send a test message
  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: '🧪 <b>Test Message</b>\n\nThis is a test from your speed dating app! If you see this, Telegram notifications are working! ✅',
        parse_mode: 'HTML',
      }),
    })

    const responseData = await response.json()

    if (!response.ok) {
      return NextResponse.json({
        success: false,
        error: 'Telegram API error',
        telegramError: responseData,
        status: response.status
      }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: 'Test message sent successfully! Check your Telegram.',
      telegramResponse: responseData
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: 'Failed to send test message',
      details: error.message,
      stack: error.stack
    }, { status: 500 })
  }
}
