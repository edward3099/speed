/**
 * ADMIN API: Telegram Notifications
 * Sends notifications to Telegram when reports/ratings are submitted
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const revalidate = 0

/**
 * Send message to Telegram
 */
async function sendTelegramMessage(message: string): Promise<{ success: boolean; error?: string }> {
  const botToken = process.env.TELEGRAM_BOT_TOKEN
  const chatId = process.env.TELEGRAM_CHAT_ID

  if (!botToken || !chatId) {
    const error = '❌ Telegram credentials not configured'
    console.error(error, { hasBotToken: !!botToken, hasChatId: !!chatId })
    return { success: false, error }
  }

  try {
    const url = `https://api.telegram.org/bot${botToken}/sendMessage`
    console.log('📤 Sending Telegram message to:', chatId)
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
    })

    const responseData = await response.json()

    if (!response.ok) {
      const error = `Telegram API error: ${JSON.stringify(responseData)}`
      console.error('❌', error)
      return { success: false, error }
    }

    console.log('✅ Telegram message sent successfully:', responseData.result?.message_id)
    return { success: true }
  } catch (error: any) {
    const errorMsg = `Error sending Telegram message: ${error.message}`
    console.error('❌', errorMsg)
    return { success: false, error: errorMsg }
  }
}

/**
 * Get user email using service role client (has admin access)
 */
async function getUserEmail(userId: string): Promise<string> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!supabaseUrl || !serviceRoleKey) {
      console.error('Missing Supabase credentials for admin access')
      return userId.substring(0, 8) + '...'
    }

    // Create admin client with service role key
    const adminClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    })

    // Try to get email from auth.users
    const { data: authData, error: authError } = await adminClient.auth.admin.getUserById(userId)
    
    if (!authError && authData?.user?.email) {
      return authData.user.email
    }

    // Fallback: try to get from profiles table
    const { data: profileData } = await adminClient
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single()

    if (profileData?.email) {
      return profileData.email
    }

    // Final fallback
    return userId.substring(0, 8) + '...'
  } catch (error) {
    console.error('Error fetching user email:', error)
    return userId.substring(0, 8) + '...'
  }
}

/**
 * POST /api/admin/notify-telegram
 * Sends notification to Telegram
 */
export async function POST(request: NextRequest) {
  try {
    // Log that endpoint was called
    console.log('📱 Telegram notification endpoint called')
    
    const body = await request.json()
    const { type, reporterId, reportedUserId, raterId, ratedUserId, category, details, rating, feedback, videoDateId } = body

    // Check credentials first
    const botToken = process.env.TELEGRAM_BOT_TOKEN
    const chatId = process.env.TELEGRAM_CHAT_ID
    
    if (!botToken || !chatId) {
      console.error('❌ Telegram credentials missing:', { hasBotToken: !!botToken, hasChatId: !!chatId })
      return NextResponse.json({ 
        success: false, 
        error: 'Telegram credentials not configured',
        hasBotToken: !!botToken,
        hasChatId: !!chatId
      }, { status: 500 })
    }

    console.log('✅ Telegram credentials found, processing notification type:', type)

    if (type === 'report') {
      // Handle report notification
      const reporterEmail = await getUserEmail(reporterId)
      const reportedUserEmail = await getUserEmail(reportedUserId)

      const message = `
🚨 <b>NEW USER REPORT</b>

👤 <b>Reporter:</b> ${reporterEmail}
🎯 <b>Reported User:</b> ${reportedUserEmail}
📋 <b>Category:</b> ${category || 'inappropriate_behaviour'}
📝 <b>Details:</b> ${details || 'No details provided'}
🆔 <b>Video Date ID:</b> ${videoDateId}
⏰ <b>Time:</b> ${new Date().toLocaleString()}
      `.trim()

      const result = await sendTelegramMessage(message)
      if (result.success) {
        console.log('✅ Report notification sent to Telegram')
      } else {
        console.error('❌ Failed to send report notification:', result.error)
      }
      return NextResponse.json({ success: result.success, error: result.error })

    } else if (type === 'rating') {
      // Handle rating notification
      // Get emails with timeout (don't block notification if email fetch fails)
      let raterEmail = raterId.substring(0, 8) + '...'
      let ratedUserEmail = ratedUserId.substring(0, 8) + '...'
      
      try {
        // Try to get emails, but don't wait too long
        const emailPromises = [
          getUserEmail(raterId).catch(() => raterId.substring(0, 8) + '...'),
          getUserEmail(ratedUserId).catch(() => ratedUserId.substring(0, 8) + '...')
        ]
        const emails = await Promise.all(emailPromises)
        raterEmail = emails[0]
        ratedUserEmail = emails[1]
      } catch (error) {
        console.warn('⚠️ Could not fetch user emails, using IDs:', error)
      }
      
      const stars = rating ? '⭐'.repeat(rating) : 'No rating'
      const feedbackText = feedback ? `\n💬 <b>Feedback:</b> ${feedback}` : ''

      const message = `
⭐ <b>NEW USER RATING</b>

👤 <b>Rater:</b> ${raterEmail}
🎯 <b>Rated User:</b> ${ratedUserEmail}
${rating ? `⭐ <b>Rating:</b> ${stars} (${rating}/5)` : '⭐ <b>Rating:</b> No rating'}${feedbackText}
🆔 <b>Video Date ID:</b> ${videoDateId}
⏰ <b>Time:</b> ${new Date().toLocaleString()}
      `.trim()

      const result = await sendTelegramMessage(message)
      if (result.success) {
        console.log('✅ Rating notification sent to Telegram')
      } else {
        console.error('❌ Failed to send rating notification:', result.error)
      }
      return NextResponse.json({ success: result.success, error: result.error })
    }

    if (type === 'support') {
      // Handle support message notification
      const { userId, userName, userEmail, message } = body
      
      const supportMessage = `
💬 <b>NEW SUPPORT MESSAGE</b>

👤 <b>User:</b> ${userName || userEmail || userId?.substring(0, 8) + '...'}
📧 <b>Email:</b> ${userEmail || 'Not provided'}
🆔 <b>User ID:</b> ${userId || 'Unknown'}

💭 <b>Message:</b>
${message}

⏰ <b>Time:</b> ${new Date().toLocaleString()}
      `.trim()

      const result = await sendTelegramMessage(supportMessage)
      if (result.success) {
        console.log('✅ Support message sent to Telegram')
      } else {
        console.error('❌ Failed to send support message:', result.error)
      }
      return NextResponse.json({ success: result.success, error: result.error })
    }

    console.error('❌ Invalid notification type:', type)
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
  } catch (error: any) {
    console.error('Error in notify-telegram:', error)
    return NextResponse.json(
      { error: 'Failed to send notification', details: error.message },
      { status: 500 }
    )
  }
}


