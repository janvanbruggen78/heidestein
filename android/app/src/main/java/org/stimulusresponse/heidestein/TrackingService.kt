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
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import androidx.core.app.NotificationCompat
import com.facebook.react.bridge.Arguments
import com.google.android.gms.location.*

class TrackingService : Service() {

  companion object {
    const val CHANNEL_ID = "tracking_v3"
    const val CHANNEL_NAME = "Route Tracking"
    const val NOTIF_ID = 2001

    const val ACTION_START_OR_UPDATE = "START_OR_UPDATE"
    const val ACTION_UPDATE_NOTIFICATION = "UPDATE_NOTIFICATION"
    const val ACTION_STOP = "STOP"
  }

  private lateinit var fused: FusedLocationProviderClient
  private var callback: LocationCallback? = null

  private var intervalMs: Long = 5000L
  private var distanceM: Float = 6f
  private var title: String = "Heidestein"
  private var startedForeground = false
  private var paused = false

  // ticker state
  private var handler: Handler? = null
  private var startMs: Long = System.currentTimeMillis()
  private var totalDistanceM: Double = 0.0
  private var lastLat: Double? = null
  private var lastLon: Double? = null

  override fun onCreate() {
    super.onCreate()
    fused = LocationServices.getFusedLocationProviderClient(this)
    handler = Handler(Looper.getMainLooper())
    ensureChannel()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    android.util.Log.d("[BG]", "onStartCommand action=${intent?.action}")

    when (intent?.action) {
      ACTION_STOP -> {
        stopSelf()
        return START_NOT_STICKY
      }

      ACTION_UPDATE_NOTIFICATION -> {
        val newTitle = intent.getStringExtra("title")?.takeIf { it.isNotBlank() } ?: title
        title = newTitle
        ensureForeground(title, if (paused) textForPaused() else currentBody())
        return START_STICKY
      }

      else /* ACTION_START_OR_UPDATE */ -> {
        val newTitle   = intent?.getStringExtra("title")?.takeIf { it.isNotBlank() } ?: title
        val newInterval = intent?.getLongExtra("intervalMs", intervalMs) ?: intervalMs
        val newDistance = intent?.getFloatExtra("distanceM", distanceM) ?: distanceM

        val prevPaused = paused
        paused = intent?.getBooleanExtra("paused", paused) ?: paused

        title = newTitle
        ensureForeground(title, if (paused) textForPaused() else currentBody())

        val optionsChanged = (newInterval != intervalMs) || (newDistance != distanceM) || callback == null
        intervalMs = newInterval
        distanceM = newDistance
        if (optionsChanged) startLocationUpdates()

        if (prevPaused && !paused) {
          postNotification(title, currentBody()) // immediate refresh on resume
        }
        return START_STICKY
      }
    }
  }

  private fun ensureForeground(t: String, b: String) {
    val notif = buildNotification(t, b)
    if (!startedForeground) {
      if (Build.VERSION.SDK_INT >= 29)
        startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
      else
        startForeground(NOTIF_ID, notif)
      startedForeground = true

      // (re)start 2s ticker
      startMs = System.currentTimeMillis()
      handler?.removeCallbacksAndMessages(null)
      handler?.post(tick)
    } else {
      postNotification(t, b)
    }
  }

  private val tick = object : Runnable {
    override fun run() {
      try {
        val b = if (paused) textForPaused() else currentBody()
        postNotification(title, b)
      } finally {
        handler?.postDelayed(this, 1000)
      }
    }
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    stopSelf()
    super.onTaskRemoved(rootIntent)
  }

  private fun startLocationUpdates() {
    callback?.let { fused.removeLocationUpdates(it) }

    val request = LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
      .setMinUpdateIntervalMillis(intervalMs)
      .setMinUpdateDistanceMeters(distanceM)
      .setWaitForAccurateLocation(false)
      .setGranularity(Granularity.GRANULARITY_PERMISSION_LEVEL)
      .build()

    callback = object : LocationCallback() {
      override fun onLocationResult(result: LocationResult) {
        for (loc in result.locations) {
          lastLat?.let { la ->
            lastLon?.let { lo ->
              totalDistanceM += haversineMeters(la, lo, loc.latitude, loc.longitude)
            }
          }
          lastLat = loc.latitude
          lastLon = loc.longitude

          // emit to JS
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
    handler?.removeCallbacksAndMessages(null)
    stopForeground(true)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  // --- helpers ---

  private fun ensureChannel() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      if (nm.getNotificationChannel(CHANNEL_ID) == null) {
        val ch = NotificationChannel(CHANNEL_ID, CHANNEL_NAME, NotificationManager.IMPORTANCE_DEFAULT)
        ch.setShowBadge(false)
        nm.createNotificationChannel(ch)
      }
    }
  }

  private fun buildNotification(t: String, b: String): Notification {
    val launchIntent = packageManager.getLaunchIntentForPackage(packageName)
      ?: Intent(this, Class.forName("$packageName.MainActivity"))
    val pending = PendingIntent.getActivity(
      this, 0, launchIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or
        (if (Build.VERSION.SDK_INT >= 23) PendingIntent.FLAG_IMMUTABLE else 0)
    )
    val smallIconRes = if (applicationInfo.icon != 0) applicationInfo.icon
                       else android.R.drawable.stat_notify_more

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle(t)
      .setContentText(b)
      .setStyle(NotificationCompat.BigTextStyle().bigText(b))
      .setSmallIcon(smallIconRes)
      .setContentIntent(pending)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
  }

  private fun postNotification(t: String, b: String) {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(NOTIF_ID, buildNotification(t, b))
  }

  private fun textForPaused(): String = "Paused — keeping service alive"

  private fun currentBody(): String {
    val dur = System.currentTimeMillis() - startMs
    return "${formatKm(totalDistanceM)} • ${formatDur(dur)}"
  }

  private fun formatKm(m: Double) = String.format("%.2f km", m / 1000.0)
  private fun formatDur(ms: Long): String {
    val s = (ms / 1000).coerceAtLeast(0)
    val hh = s / 3600; val mm = (s % 3600) / 60; val ss = s % 60
    return String.format("%02d:%02d:%02d", hh, mm, ss)
  }
  private fun haversineMeters(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
    val R = 6371000.0
    val dLat = Math.toRadians(lat2 - lat1)
    val dLon = Math.toRadians(lon2 - lon1)
    val a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
            Math.sin(dLon/2)*Math.sin(dLon/2)
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  }
}
