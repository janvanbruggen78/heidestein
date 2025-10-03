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
        putExtra("body", opts.getString("body") ?: "Recording your movement…")
        putExtra("intervalMs", if (opts.hasKey("intervalMs")) opts.getDouble("intervalMs").toLong() else 5000L)
        putExtra("distanceM", if (opts.hasKey("distanceM")) opts.getDouble("distanceM").toFloat() else 6f)
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
        if (opts.hasKey("body")) putExtra("body", opts.getString("body"))
        if (opts.hasKey("intervalMs")) putExtra("intervalMs", opts.getDouble("intervalMs").toLong())
        if (opts.hasKey("distanceM")) putExtra("distanceM", opts.getDouble("distanceM").toFloat())
      }
      ContextCompat.startForegroundService(rc, i)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_NATIVE_UPDATE", e)
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
}
