package org.stimulusresponse.heidestein

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.google.android.gms.location.*


class TrackingService : Service() {

  companion object {
    const val CHANNEL_ID = "tracking"
    const val CHANNEL_NAME = "Route Tracking"
    const val NOTIF_ID = 2001
    const val ACTION_START_OR_UPDATE = "START_OR_UPDATE"
    const val ACTION_STOP = "STOP"
  }

  private lateinit var fused: FusedLocationProviderClient
  private var callback: LocationCallback? = null

  private var intervalMs: Long = 5000L
  private var distanceM: Float = 6f
  private var title: String = "Heidestein"
  private var body: String = "Recording your movement…"

  override fun onCreate() {
    super.onCreate()
    fused = LocationServices.getFusedLocationProviderClient(this)
    ensureChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        // Read options (defaults above)
        title = intent?.getStringExtra("title") ?: title
        body = intent?.getStringExtra("body") ?: body
        intervalMs = intent?.getLongExtra("intervalMs", intervalMs) ?: intervalMs
        distanceM = intent?.getFloatExtra("distanceM", distanceM) ?: distanceM

        // (Re)post foreground notification
        val notif = buildNotification(title, body)
        if (Build.VERSION.SDK_INT >= 29)
          startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        else
          startForeground(NOTIF_ID, notif)

        // (Re)start location updates with new options
        startLocationUpdates()
      }
    }
    return START_STICKY
  }

  private fun startLocationUpdates() {
    // Cancel previous callback if any
    callback?.let { fused.removeLocationUpdates(it) }

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateDistanceMeters(distanceM)
      .setWaitForAccurateLocation(false)
      .build()

    callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        for (loc in result.locations) {
          val map = Arguments.createMap().apply {
            putDouble("latitude", loc.latitude)
            putDouble("longitude", loc.longitude)
            putDouble("accuracy", loc.accuracy.toDouble())
            putDouble("speed", loc.speed.toDouble())
            putDouble("altitude", loc.altitude)
            putDouble("ts", loc.time.toDouble())
          }
          RNBridge.emit("heidesteinLocation", map)
        }
      }
    }

    fused.requestLocationUpdates(request, callback!!, Looper.getMainLooper())
  }

  override fun onDestroy() {
    try { callback?.let { fused.removeLocationUpdates(it) } } catch (_: Exception) {}
    stopForeground(true)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        val ch = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_LOW)
        ch.setShowBadge(false)
        nm.createNotificationChannel(ch)
      }
    }
  }

  private fun buildNotification(title: String, body: String): Notification {
    val launchIntent = Intent(this, MainActivity::class.java).apply {
      addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    }
    val pending = PendingIntent.getActivity(
      this, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
    )
    val smallIconRes = if (applicationInfo.icon != 0) applicationInfo.icon
                       else android.R.drawable.stat_notify_more

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setSmallIcon(smallIconRes)
      .setContentIntent(pending)
      .setOngoing(true)       // non-dismissible
      .setOnlyAlertOnce(true)
      .build()
  }
}
