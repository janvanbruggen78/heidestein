package org.stimulusresponse.heidestein

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.*

class StickyNotificationModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    private const val CHANNEL_ID = "tracking"
    private const val CHANNEL_NAME = "Route Tracking"
    private const val NOTIF_ID = 1001
  }

  override fun getName(): String = "StickyNotification"

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        val ch = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
        ch.setShowBadge(false)
        nm.createNotificationChannel(ch)
      }
    }
  }

  private fun build(title: String, body: String): Notification {
    ensureChannel()
    val ctx = reactContext

    // Tap → open app (MainActivity)
    val launchIntent = Intent(ctx, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = PendingIntent.getActivity(
      ctx, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
    )

    // Use app icon if available
    val smallIconRes = if (ctx.applicationInfo.icon != 0)
      ctx.applicationInfo.icon else android.R.drawable.stat_notify_more

    return NotificationCompat.Builder(ctx, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setSmallIcon(smallIconRes)
      .setContentIntent(pending)
      .setOnlyAlertOnce(true)
      .setOngoing(true)      // non-dismissible
      .setAutoCancel(false)
      .build()
  }

  @ReactMethod
  fun show(title: String, body: String, promise: Promise) {
    try {
      val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIF_ID, build(title, body))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_SHOW", e)
    }
  }

  @ReactMethod
  fun update(title: String, body: String, promise: Promise) {
    try {
      val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(NOTIF_ID, build(title, body))
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_UPDATE", e)
    }
  }

  @ReactMethod
  fun hide(promise: Promise) {
    try {
      val nm = reactContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.cancel(NOTIF_ID)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_HIDE", e)
    }
  }
}
