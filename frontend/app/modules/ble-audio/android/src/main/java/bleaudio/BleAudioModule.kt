package bleaudio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class BleAudioModule : Module() {
  private var engine: BleAudioEngine? = null

  override fun definition() = ModuleDefinition {
    Name("ClearHearAudio")

    Events("onStateChange")

    AsyncFunction("getStatusAsync") {
      requireEngine().getStatus()
    }

    AsyncFunction("getInputDevicesAsync") {
      requireEngine().getInputDevices()
    }

    AsyncFunction("getBufferedAudioStatusAsync") {
      requireEngine().getBufferedAudioStatus()
    }

    AsyncFunction("exportBufferedAudioAsync") {
      requireEngine().exportBufferedAudio()
    }

    AsyncFunction("clearBufferedAudioAsync") {
      requireEngine().clearBufferedAudio()
    }

    AsyncFunction("startAsync") { configJson: String ->
      requireEngine().start(configJson)
    }

    AsyncFunction("updateProfileAsync") { configJson: String ->
      requireEngine().updateProfile(configJson)
    }

    AsyncFunction("stopAsync") {
      requireEngine().stop()
    }

    OnDestroy {
      engine?.close()
      engine = null
    }
  }

  private fun requireEngine(): BleAudioEngine {
    engine?.let {
      return it
    }

    val context = appContext.reactContext?.applicationContext
      ?: throw IllegalStateException("React context is not available.")

    return BleAudioEngine(context) { status ->
      sendEvent("onStateChange", status)
    }.also {
      engine = it
    }
  }
}
