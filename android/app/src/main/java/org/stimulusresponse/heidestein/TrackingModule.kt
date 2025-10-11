package org.stimulusresponse.heidestein

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*

class TrackingModule(private val rc: ReactApplicationContext) : ReactContextBaseJavaModule(rc) {
  init { RNBridge.setContext(rc) }

  override fun getName(): String = "Tracking"

  @ReactMethod
  fun start(opts: ReadableMap, promise: Promise) {
    try {
      val i = Intent(rc, TrackingService::class.java).apply {
        action = TrackingService.ACTION_START_OR_UPDATE
        putExtra("title", opts.getString("title") ?: "Heidestein")
        if (opts.hasKey("intervalMs")) putExtra("intervalMs", opts.getDouble("intervalMs").toLong())
        if (opts.hasKey("distanceM")) putExtra("distanceM", opts.getDouble("distanceM").toFloat())
        if (opts.hasKey("paused")) putExtra("paused", opts.getBoolean("paused"))
      }
      ContextCompat.startForegroundService(rc, i)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_NATIVE_START", e)
    }
  }

  @ReactMethod
  fun updateOptions(opts: ReadableMap, promise: Promise) {
    try {
      val i = Intent(rc, TrackingService::class.java).apply {
        action = TrackingService.ACTION_START_OR_UPDATE
        if (opts.hasKey("title")) putExtra("title", opts.getString("title"))
        if (opts.hasKey("intervalMs")) putExtra("intervalMs", opts.getDouble("intervalMs").toLong())
        if (opts.hasKey("distanceM")) putExtra("distanceM", opts.getDouble("distanceM").toFloat())
        if (opts.hasKey("paused")) putExtra("paused", opts.getBoolean("paused"))
      }
      ContextCompat.startForegroundService(rc, i)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_NATIVE_UPDATE", e)
    }
  }

  @ReactMethod
  fun updateNotification(title: String, body: String, promise: Promise) {
    try {
      val i = Intent(rc, TrackingService::class.java).apply {
        action = TrackingService.ACTION_UPDATE_NOTIFICATION
        putExtra("title", title)
        putExtra("body", body) // body is ignored when minimal/paused logic applies
      }
      ContextCompat.startForegroundService(rc, i)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_NATIVE_UPDATE_NOTIF", e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val i = Intent(rc, TrackingService::class.java).apply {
        action = TrackingService.ACTION_STOP
      }
      rc.startService(i)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_NATIVE_STOP", e)
    }
  }

  /**
   * New: push precise UI totals to the service so the sticky notification
   * mirrors the TrackingScreen (distance, duration incl. pauses/resumes).
   */
  @ReactMethod
  fun updateNotificationStats(params: ReadableMap, promise: Promise) {
    try {
      val i = Intent(rc, TrackingService::class.java).apply {
        action = TrackingService.ACTION_JS_UPDATE_STATS
        if (params.hasKey("trackId")) putExtra("trackId", params.getString("trackId"))
        if (params.hasKey("status")) putExtra("status", params.getString("status"))
        if (params.hasKey("distanceMeters")) putExtra("distanceMeters", params.getDouble("distanceMeters"))
        // JS number arrives as Double; service reads Long → cast here.
        if (params.hasKey("durationMs")) putExtra("durationMs", params.getDouble("durationMs").toLong())
        if (params.hasKey("avgSpeedMps")) putExtra("avgSpeedMps", params.getDouble("avgSpeedMps"))
      }
      ContextCompat.startForegroundService(rc, i)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_NATIVE_UPDATE_STATS", e)
    }
  }

  // Stubs to satisfy NativeEventEmitter warnings (even if you use DeviceEventEmitter)
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
