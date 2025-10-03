package org.stimulusresponse.heidestein

import android.content.Intent
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.*

class StickyNotificationModule(private val rc: ReactApplicationContext)
  : ReactContextBaseJavaModule(rc) {

  override fun getName(): String = "StickyNotification"

  @ReactMethod
  fun update(title: String, body: String, promise: Promise) {
    try {
      val i = Intent(rc, TrackingService::class.java).apply {
        action = TrackingService.ACTION_UPDATE_NOTIFICATION
        putExtra("title", title)
        putExtra("body", body)
      }
      ContextCompat.startForegroundService(rc, i)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ERR_UPDATE_STICKY", e)
    }
  }

  // Stubs to satisfy NativeEventEmitter warnings (harmless no-ops)
  @ReactMethod fun addListener(eventName: String) {}
  @ReactMethod fun removeListeners(count: Int) {}
}
