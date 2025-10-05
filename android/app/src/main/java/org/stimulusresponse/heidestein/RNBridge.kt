package org.stimulusresponse.heidestein

import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.modules.core.DeviceEventManagerModule
import com.facebook.react.bridge.WritableMap

object RNBridge {
  @Volatile private var ctx: ReactApplicationContext? = null
  fun setContext(c: ReactApplicationContext) { ctx = c }
  fun emit(event: String, params: WritableMap) {
    ctx?.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
      ?.emit(event, params)
  }
}
