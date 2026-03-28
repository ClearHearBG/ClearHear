package bleaudio

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioFormat
import android.media.AudioManager
import android.media.AudioRecord
import android.media.AudioTrack
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import org.json.JSONObject
import java.io.File
import java.io.FileOutputStream
import kotlin.math.ln
import kotlin.math.abs
import kotlin.math.max

private const val DEFAULT_MAX_GAIN_DB = 18.0
private const val DEFAULT_BAND_COUNT = 24
private const val MAX_BAND_COUNT = 32
private const val MIN_BAND_COUNT = 8
private const val MIN_TEST_FREQUENCY_HZ = 63.0
private const val MAX_TEST_FREQUENCY_HZ = 16000.0
private const val FILTER_Q = 1.15
private const val MIN_ACTIVE_GAIN_DB = 0.25
private const val OUTPUT_HEADROOM = 0.82f
private const val SHORT_BYTES = 2
private const val MIN_PROCESSING_CHUNK_FRAMES = 32
private const val MAX_PROCESSING_CHUNK_FRAMES = 96
private const val TARGET_WIRED_CHUNK_DURATION_MS = 2
private const val TARGET_BLUETOOTH_CHUNK_DURATION_MS = 4
private const val STARTUP_MUTE_CHUNKS = 0
private const val STARTUP_FADE_CHUNKS = 1
private const val ROLLING_BUFFER_MAX_SECONDS = 15
private const val RECENT_INPUT_THRESHOLD = 0.015f
private const val RECENT_INPUT_WINDOW_MS = 1500L

internal class BleAudioEngine(
  context: Context,
  private val onStatusChange: (Map<String, Any?>) -> Unit,
) {
  private val appContext = context.applicationContext
  private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val mainHandler = Handler(Looper.getMainLooper())
  private val lock = Any()

  private var currentConfig = HearingSupportConfig(emptyList(), DEFAULT_MAX_GAIN_DB, DEFAULT_BAND_COUNT, 6.0, 1.0, null, null)
  private var currentStage = "idle"
  private var lastError: String? = null
  private var activeInputChannels = 1
  private var activeSampleRate: Int? = null
  private var activeBufferFrames: Int? = null
  private var selectedInput: AudioDeviceInfo? = null
  private var selectedOutput: AudioDeviceInfo? = null
  private var audioRecord: AudioRecord? = null
  private var audioTrack: AudioTrack? = null
  private var workerThread: Thread? = null
  private var previousAudioMode: Int? = null
  private var bluetoothScoStarted = false
  private var running = false
  private var rollingBuffer = ShortArray(0)
  private var rollingBufferWriteIndex = 0
  private var rollingBufferSampleCount = 0
  private var rollingBufferSampleRate: Int? = null
  private var recentInputLevel = 0f
  private var recentInputAtMs = 0L

  private val deviceCallback = object : AudioDeviceCallback() {
    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>) {
      emitStatus()
    }

    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>) {
      emitStatus()
    }
  }

  init {
    audioManager.registerAudioDeviceCallback(deviceCallback, mainHandler)
  }

  fun close() {
    stop(clearError = true)
    audioManager.unregisterAudioDeviceCallback(deviceCallback)
  }

  fun getStatus(): Map<String, Any?> {
    synchronized(lock) {
      return buildStatusLocked()
    }
  }

  fun getInputDevices(): List<Map<String, Any?>> {
    synchronized(lock) {
      return listSupportedInputDevicesLocked().mapNotNull(::deviceToMap)
    }
  }

  fun getBufferedAudioStatus(): Map<String, Any?> {
    synchronized(lock) {
      return buildBufferedAudioStatusLocked()
    }
  }

  fun clearBufferedAudio() {
    synchronized(lock) {
      clearBufferedAudioLocked(resetFormat = false)
    }
  }

  fun exportBufferedAudio(): Map<String, Any> {
    val sampleRate: Int
    val samples: ShortArray

    synchronized(lock) {
      sampleRate = rollingBufferSampleRate
        ?: throw IllegalStateException("No rolling audio is available yet. Turn listening on and try again in a few seconds.")

      if (rollingBufferSampleCount <= 0) {
        throw IllegalStateException("No rolling audio is available yet. Turn listening on and try again in a few seconds.")
      }

      samples = copyBufferedAudioLocked()
    }

    val file = File(appContext.cacheDir, "clearhear-recap-${System.currentTimeMillis()}.wav")
    writeWavFile(file, samples, sampleRate)

    return mapOf(
      "uri" to "file://${file.absolutePath}",
      "name" to file.name,
      "mimeType" to "audio/wav",
      "durationSeconds" to (samples.size.toDouble() / sampleRate.toDouble()),
    )
  }

  fun start(configJson: String): Map<String, Any?> {
    val config = parseConfig(configJson)
    stop(clearError = false)

    val routeSelection: SelectedAudioRoute
    val inputDevice: AudioDeviceInfo
    val outputDevice: AudioDeviceInfo?
    val formatChoice: AudioFormatChoice
    val record: AudioRecord
    val track: AudioTrack

    synchronized(lock) {
      currentConfig = config

      if (config.points.isEmpty()) {
        currentStage = "error"
        lastError = "Ear test results are unavailable. Run the ear test before enabling live support."
        return emitAndReturnStatusLocked()
      }

      routeSelection = selectPreferredRouteLocked()
        ?: run {
          currentStage = "error"
          lastError = "Connect headphones or earbuds to start live hearing support."
          return emitAndReturnStatusLocked()
        }

      inputDevice = routeSelection.inputDevice
      outputDevice = routeSelection.outputDevice

      formatChoice = chooseAudioFormat(inputDevice)
        ?: run {
          currentStage = "error"
          lastError = "No compatible live-audio format was found for the selected audio input."
          return emitAndReturnStatusLocked()
        }

      try {
        record = buildAudioRecord(inputDevice, formatChoice)
        track = buildAudioTrack(inputDevice, outputDevice, formatChoice)
      } catch (error: Throwable) {
        currentStage = "error"
        lastError = error.message ?: "Failed to open the headset audio stream."
        clearActiveRouteLocked()
        return emitAndReturnStatusLocked()
      }

      running = true
      currentStage = "starting"
      lastError = null
      activeInputChannels = formatChoice.inputChannels
      activeSampleRate = formatChoice.sampleRate
      activeBufferFrames = formatChoice.processingChunkFrames
      prepareRollingBufferLocked(formatChoice.sampleRate)
      selectedInput = inputDevice
      selectedOutput = outputDevice
      audioRecord = record
      audioTrack = track
    }

    val worker = Thread(
      {
        runAudioLoop(record, track, formatChoice, inputDevice, outputDevice)
      },
      "ClearHearAudioEngine",
    )

    synchronized(lock) {
      workerThread = worker
      emitStatusLocked()
    }

    worker.start()
    synchronized(lock) {
      return buildStatusLocked()
    }
  }

  fun updateProfile(configJson: String): Map<String, Any?> {
    return start(configJson)
  }

  fun stop(): Map<String, Any?> {
    stop(clearError = true)
    synchronized(lock) {
      return buildStatusLocked()
    }
  }

  private fun stop(clearError: Boolean) {
    val threadToJoin: Thread?
    val recordToStop: AudioRecord?
    val trackToStop: AudioTrack?

    synchronized(lock) {
      running = false
      threadToJoin = workerThread
      recordToStop = audioRecord
      trackToStop = audioTrack
    }

    stopRecord(recordToStop)
    stopTrack(trackToStop)
    threadToJoin?.join(1000)

    synchronized(lock) {
      clearRoutingLocked()
      audioRecord = null
      audioTrack = null
      workerThread = null
      currentStage = "idle"
      if (clearError) {
        lastError = null
      }
      clearActiveRouteLocked()
      emitStatusLocked()
    }
  }

  private fun runAudioLoop(
    record: AudioRecord,
    track: AudioTrack,
    formatChoice: AudioFormatChoice,
    inputDevice: AudioDeviceInfo,
    outputDevice: AudioDeviceInfo?,
  ) {
    Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)

    var failureMessage: String? = null
    val recordEffects = configureInputEffects(record)

    try {
      configureRouting(record, track, inputDevice, outputDevice)
      val filterBanks = buildFilterBanks(currentConfig, formatChoice.sampleRate)
      val calibratedOutputGain = OUTPUT_HEADROOM * dbToLinear(currentConfig.baseGainDb)
      var startupFramesMuted = formatChoice.processingChunkFrames * STARTUP_MUTE_CHUNKS
      var startupFadeFramesRemaining = formatChoice.processingChunkFrames * STARTUP_FADE_CHUNKS

      record.startRecording()
      if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        throw IllegalStateException("Headset microphone capture did not start.")
      }

      track.play()
      if (track.playState != AudioTrack.PLAYSTATE_PLAYING) {
        throw IllegalStateException("Headset audio playback did not start.")
      }

      val actualInputDevice = record.routedDevice ?: inputDevice
      val actualOutputDevice = track.routedDevice ?: outputDevice
      val runtimeInputChannels = resolveRuntimeInputChannels(record, actualInputDevice, formatChoice.inputChannels)
      val inputBuffer = ShortArray(formatChoice.processingChunkFrames * max(runtimeInputChannels, formatChoice.inputChannels))
      val outputBuffer = ShortArray(formatChoice.processingChunkFrames * 2)
      val recapBuffer = ShortArray(formatChoice.processingChunkFrames)

      synchronized(lock) {
        if (running) {
          activeInputChannels = runtimeInputChannels
          selectedInput = actualInputDevice
          selectedOutput = actualOutputDevice
          currentStage = "running"
          emitStatusLocked()
        }
      }

      while (isRunning()) {
        val samplesRead = readFromRecord(record, inputBuffer)
        if (samplesRead <= 0) {
          if (!isRunning()) {
            break
          }
          throw IllegalStateException("Live microphone capture stopped unexpectedly ($samplesRead).")
        }

        val framesRead = samplesRead / runtimeInputChannels
        var inputIndex = 0
        var outputIndex = 0
        var inputPeak = 0f

        for (frame in 0 until framesRead) {
          val inputLeft: Float
          val inputRight: Float

          if (runtimeInputChannels == 2 && inputIndex + 1 < samplesRead) {
            inputLeft = pcm16ToFloat(inputBuffer[inputIndex])
            inputRight = pcm16ToFloat(inputBuffer[inputIndex + 1])
            inputIndex += 2
          } else {
            val sharedInput = pcm16ToFloat(inputBuffer[inputIndex])
            inputLeft = sharedInput
            inputRight = sharedInput
            inputIndex += 1
          }

          val recapSample = if (runtimeInputChannels >= 2) {
            clampAudio((inputLeft + inputRight) * 0.5f)
          } else {
            inputLeft
          }
          recapBuffer[frame] = floatToPcm16(recapSample)
          inputPeak = max(inputPeak, max(abs(inputLeft), abs(inputRight)))

          var outputLeft: Float
          var outputRight: Float

          if (runtimeInputChannels >= 2) {
            outputLeft = clampAudio(filterBanks.left.process(inputLeft) * calibratedOutputGain)
            outputRight = clampAudio(filterBanks.right.process(inputRight) * calibratedOutputGain)
          } else {
            val sharedOutput = clampAudio(filterBanks.shared.process(inputLeft) * calibratedOutputGain)
            outputLeft = sharedOutput
            outputRight = sharedOutput
          }

          if (startupFramesMuted > 0) {
            outputLeft = 0f
            outputRight = 0f
            startupFramesMuted -= 1
          } else if (startupFadeFramesRemaining > 0) {
            val fadeProgress = 1f - (startupFadeFramesRemaining.toFloat() / (formatChoice.processingChunkFrames * STARTUP_FADE_CHUNKS).toFloat())
            val fadeGain = fadeProgress.coerceIn(0f, 1f)
            outputLeft *= fadeGain
            outputRight *= fadeGain
            startupFadeFramesRemaining -= 1
          }

          outputBuffer[outputIndex] = floatToPcm16(outputLeft)
          outputBuffer[outputIndex + 1] = floatToPcm16(outputRight)
          outputIndex += 2
        }

        synchronized(lock) {
          appendRollingAudioLocked(recapBuffer, framesRead, inputPeak)
        }

        writeToTrack(track, outputBuffer, framesRead * 2)
      }
    } catch (error: Throwable) {
      if (isRunning()) {
        failureMessage = error.message ?: "Live hearing support stopped unexpectedly."
      }
    } finally {
      recordEffects.release()
      stopRecord(record)
      stopTrack(track)
      record.release()
      track.release()

      synchronized(lock) {
        clearRoutingLocked()
        if (audioRecord === record) {
          audioRecord = null
        }
        if (audioTrack === track) {
          audioTrack = null
        }
        if (workerThread === Thread.currentThread()) {
          workerThread = null
        }

        if (failureMessage != null) {
          running = false
          currentStage = "error"
          lastError = failureMessage
        } else if (!running) {
          currentStage = "idle"
          clearActiveRouteLocked()
        }

        recentInputLevel = 0f
        recentInputAtMs = 0L

        emitStatusLocked()
      }
    }
  }

  private fun configureRouting(
    record: AudioRecord,
    track: AudioTrack,
    inputDevice: AudioDeviceInfo,
    outputDevice: AudioDeviceInfo?,
  ) {
    val useCommunicationRouting = requiresCommunicationRouting(inputDevice)

    if (useCommunicationRouting) {
      synchronized(lock) {
        if (previousAudioMode == null) {
          previousAudioMode = audioManager.mode
        }
        audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
      }
    }

    if (useCommunicationRouting && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      val communicationDevice = outputDevice?.let(::findCommunicationDevice)
      communicationDevice?.let { audioManager.setCommunicationDevice(it) }
    } else if (useCommunicationRouting && inputDevice.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
      @Suppress("DEPRECATION")
      audioManager.startBluetoothSco()
      @Suppress("DEPRECATION")
      audioManager.isBluetoothScoOn = true
      synchronized(lock) {
        bluetoothScoStarted = true
      }
    }

    record.setPreferredDevice(inputDevice)
    outputDevice?.let {
      track.setPreferredDevice(it)
    }
  }

  private fun clearRoutingLocked() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audioManager.clearCommunicationDevice()
    } else if (bluetoothScoStarted) {
      @Suppress("DEPRECATION")
      audioManager.stopBluetoothSco()
      @Suppress("DEPRECATION")
      audioManager.isBluetoothScoOn = false
      bluetoothScoStarted = false
    }

    previousAudioMode?.let {
      audioManager.mode = it
      previousAudioMode = null
    }
  }

  private fun buildAudioRecord(inputDevice: AudioDeviceInfo, formatChoice: AudioFormatChoice): AudioRecord {
    val audioFormat = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .setSampleRate(formatChoice.sampleRate)
      .setChannelMask(if (formatChoice.inputChannels == 2) AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO)
      .build()

    val bufferSizeBytes = formatChoice.recordBufferFrames * formatChoice.inputChannels * SHORT_BYTES

    buildAudioSourceCandidates(inputDevice).forEach { audioSource ->
      val builder = AudioRecord.Builder()
        .setAudioSource(audioSource)
        .setAudioFormat(audioFormat)
        .setBufferSizeInBytes(bufferSizeBytes)

      val record = builder.build()
      if (record.state == AudioRecord.STATE_INITIALIZED) {
        record.setPreferredDevice(inputDevice)
        return record
      }

      record.release()
    }

    throw IllegalStateException("Could not initialize microphone capture for the selected route.")
  }

  private fun buildAudioTrack(
    inputDevice: AudioDeviceInfo,
    outputDevice: AudioDeviceInfo?,
    formatChoice: AudioFormatChoice,
  ): AudioTrack {
    val audioFormat = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .setSampleRate(formatChoice.sampleRate)
      .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
      .build()

    val audioAttributes = AudioAttributes.Builder()
      .setUsage(if (requiresCommunicationRouting(inputDevice)) AudioAttributes.USAGE_VOICE_COMMUNICATION else AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()

    val builder = AudioTrack.Builder()
      .setAudioAttributes(audioAttributes)
      .setAudioFormat(audioFormat)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setBufferSizeInBytes(formatChoice.trackBufferFrames * 2 * SHORT_BYTES)

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      builder.setPerformanceMode(AudioTrack.PERFORMANCE_MODE_LOW_LATENCY)
    }

    val track = builder.build()

    if (track.state != AudioTrack.STATE_INITIALIZED) {
      track.release()
      throw IllegalStateException("Could not initialize headphone playback.")
    }

    outputDevice?.let {
      track.setPreferredDevice(it)
    }

    return track
  }

  private fun buildFilterBanks(config: HearingSupportConfig, sampleRate: Int): StereoFilterBank {
    val leftPoints = pointsForEar(config.points, "left")
    val rightPoints = pointsForEar(config.points, "right")
    val leftFallback = if (leftPoints.isNotEmpty()) leftPoints else rightPoints
    val rightFallback = if (rightPoints.isNotEmpty()) rightPoints else leftPoints
    val sharedPoints = sharedPoints(leftFallback, rightFallback)
    val leftCurve = GainCurve(leftFallback, config.maxGainDb, config.boostMultiplier)
    val rightCurve = GainCurve(rightFallback, config.maxGainDb, config.boostMultiplier)
    val sharedCurve = GainCurve(sharedPoints, config.maxGainDb, config.boostMultiplier)
    val bandCenters = createLogBandCenters(config.bandCount)

    return StereoFilterBank(
      left = createFilterBank(leftCurve, bandCenters, sampleRate),
      right = createFilterBank(rightCurve, bandCenters, sampleRate),
      shared = createFilterBank(sharedCurve, bandCenters, sampleRate),
    )
  }

  private fun sharedPoints(leftPoints: List<GainPoint>, rightPoints: List<GainPoint>): List<GainPoint> {
    if (leftPoints.isEmpty()) {
      return rightPoints
    }

    if (rightPoints.isEmpty()) {
      return leftPoints
    }

    val rightByFrequency = rightPoints.associateBy { it.frequencyHz }

    return leftPoints.map { leftPoint ->
      val rightPoint = rightByFrequency[leftPoint.frequencyHz]
      val averageGain = if (rightPoint != null) {
        (leftPoint.gainDb + rightPoint.gainDb) / 2.0
      } else {
        leftPoint.gainDb
      }

      GainPoint(leftPoint.frequencyHz, averageGain)
    }
  }

  private fun createFilterBank(curve: GainCurve, bandCenters: DoubleArray, sampleRate: Int): FilterBank {
    val filters = mutableListOf<BiquadFilter>()

    for (frequencyHz in bandCenters) {
      val gainDb = curve.gainFor(frequencyHz)
      if (gainDb >= MIN_ACTIVE_GAIN_DB) {
        filters.add(BiquadFilter(BiquadCoefficients.peaking(sampleRate.toDouble(), frequencyHz, FILTER_Q, gainDb)))
      }
    }

    return FilterBank(filters)
  }

  private fun createLogBandCenters(count: Int): DoubleArray {
    val safeCount = count.coerceIn(MIN_BAND_COUNT, MAX_BAND_COUNT)
    if (safeCount == 1) {
      return doubleArrayOf(MIN_TEST_FREQUENCY_HZ)
    }

    val startLog = ln(MIN_TEST_FREQUENCY_HZ)
    val endLog = ln(MAX_TEST_FREQUENCY_HZ)
    val step = (endLog - startLog) / (safeCount - 1)

    return DoubleArray(safeCount) { index ->
      kotlin.math.exp(startLog + index * step)
    }
  }

  private fun chooseAudioFormat(inputDevice: AudioDeviceInfo): AudioFormatChoice? {
    val channelOptions = if (supportsStereoInput(inputDevice)) listOf(2, 1) else listOf(1)
    val sampleRates = buildSampleRateCandidates(inputDevice)

    for (channels in channelOptions) {
      val inputMask = if (channels == 2) AudioFormat.CHANNEL_IN_STEREO else AudioFormat.CHANNEL_IN_MONO
      for (sampleRate in sampleRates) {
        val recordMinBytes = AudioRecord.getMinBufferSize(sampleRate, inputMask, AudioFormat.ENCODING_PCM_16BIT)
        val trackMinBytes = AudioTrack.getMinBufferSize(sampleRate, AudioFormat.CHANNEL_OUT_STEREO, AudioFormat.ENCODING_PCM_16BIT)

        if (recordMinBytes <= 0 || trackMinBytes <= 0) {
          continue
        }

        val processingChunkFrames = chooseProcessingChunkFrames(sampleRate, inputDevice.type)
        val recordMinFrames = bytesToFrames(recordMinBytes, channels)
        val trackMinFrames = bytesToFrames(trackMinBytes, 2)

        return AudioFormatChoice(
          sampleRate = sampleRate,
          inputChannels = channels,
          recordBufferFrames = max(recordMinFrames, processingChunkFrames * 2),
          trackBufferFrames = max(trackMinFrames, processingChunkFrames * 2),
          processingChunkFrames = processingChunkFrames,
        )
      }
    }

    return null
  }

  private fun bytesToFrames(bufferBytes: Int, channels: Int): Int {
    val rawFrames = max(MIN_PROCESSING_CHUNK_FRAMES, bufferBytes / (channels * SHORT_BYTES))
    return ((rawFrames + 31) / 32) * 32
  }

  private fun chooseProcessingChunkFrames(sampleRate: Int, inputType: Int): Int {
    val targetDurationMs = if (isBluetoothType(inputType)) TARGET_BLUETOOTH_CHUNK_DURATION_MS else TARGET_WIRED_CHUNK_DURATION_MS
    val targetFrames = (sampleRate * targetDurationMs) / 1000
    return roundUpFrames(targetFrames.coerceIn(MIN_PROCESSING_CHUNK_FRAMES, MAX_PROCESSING_CHUNK_FRAMES))
  }

  private fun roundUpFrames(frameCount: Int): Int {
    return ((frameCount + 31) / 32) * 32
  }

  private fun buildSampleRateCandidates(inputDevice: AudioDeviceInfo): List<Int> {
    val preferredRates = if (isBluetoothType(inputDevice.type)) {
      listOf(48000, 32000, 24000, 16000, 8000)
    } else {
      listOf(96000, 48000, 44100, 32000, 24000, 16000, 8000)
    }

    val candidateRates = linkedSetOf<Int>()
    val advertisedRates = inputDevice.sampleRates.filter { it > 0 }

    preferredRates.filter(advertisedRates::contains).forEach(candidateRates::add)
    preferredRates.forEach(candidateRates::add)
    advertisedRates.forEach(candidateRates::add)

    return candidateRates.toList()
  }

  private fun selectPreferredRouteLocked(): SelectedAudioRoute? {
    val inputDevices = listSupportedInputDevicesLocked()
    val outputDevices = listCandidateOutputDevicesLocked()

    if (inputDevices.isEmpty() || outputDevices.isEmpty()) {
      return null
    }

    return inputDevices
      .flatMap { inputDevice ->
        outputDevices.map { outputDevice ->
          ScoredRoute(inputDevice, outputDevice, scoreRoute(inputDevice, outputDevice))
        }
      }
      .maxByOrNull { it.score }
      ?.takeIf { it.score > 0 }
      ?.let { SelectedAudioRoute(it.inputDevice, it.outputDevice) }
  }

  private fun listCandidateOutputDevicesLocked(): List<AudioDeviceInfo> {
    val devicesById = linkedMapOf<Int, AudioDeviceInfo>()

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audioManager.availableCommunicationDevices
        .filter { it.isSink }
        .forEach { device ->
          devicesById[device.id] = device
        }
    }

    audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
      .filter { it.isSink }
      .forEach { device ->
        devicesById.putIfAbsent(device.id, device)
      }

    return devicesById.values
      .filter { scorePreferredOutputDevice(it) > 0 }
      .sortedByDescending(::scorePreferredOutputDevice)
  }

  private fun listSupportedInputDevicesLocked(): List<AudioDeviceInfo> {
    return audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
      .filter { it.isSource && isSupportedInputType(it.type) }
      .sortedByDescending { scoreInputDevice(it) }
  }

  private fun scoreInputDevice(device: AudioDeviceInfo): Int {
    var score = when (device.type) {
      AudioDeviceInfo.TYPE_USB_HEADSET -> 860
      AudioDeviceInfo.TYPE_USB_DEVICE -> 820
      AudioDeviceInfo.TYPE_USB_ACCESSORY -> 800
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> 760
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> 700
      AudioDeviceInfo.TYPE_BLE_HEADSET -> 660
      AudioDeviceInfo.TYPE_BUILTIN_MIC -> 140
      else -> 0
    }

    if (supportsStereoInput(device)) {
      score += 180
    }

    score += device.channelCounts.maxOrNull() ?: 0
    return score
  }

  private fun scoreRoute(inputDevice: AudioDeviceInfo, outputDevice: AudioDeviceInfo): Int {
    val outputScore = scorePreferredOutputDevice(outputDevice)
    if (outputScore <= 0) {
      return 0
    }

    var score = outputScore + scoreInputForLiveSupport(inputDevice, outputDevice)

    if (supportsStereoInput(inputDevice)) {
      score += if (inputDevice.type == AudioDeviceInfo.TYPE_BUILTIN_MIC) 60 else 240
    }

    if (deviceName(outputDevice).equals(deviceName(inputDevice), ignoreCase = true)) {
      score += 140
    }

    if (outputDevice.type == inputDevice.type) {
      score += 140
    }

    if (isBluetoothType(outputDevice.type) && isBluetoothType(inputDevice.type)) {
      score += 180
    }

    if (matchesPreferredDeviceId(currentConfig.preferredInputId, inputDevice)) {
      score += 200000
    }

    if (matchesPreferredDeviceId(currentConfig.preferredOutputId, outputDevice)) {
      score += 200000
    }

    return score
  }

  private fun scorePreferredOutputDevice(device: AudioDeviceInfo): Int {
    return when (device.type) {
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> 1000
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> 960
      AudioDeviceInfo.TYPE_USB_HEADSET -> 920
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_USB_ACCESSORY
      -> 860
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> 340
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> 280
      AudioDeviceInfo.TYPE_BLE_HEADSET -> 240
      else -> 0
    }
  }

  private fun scoreInputForLiveSupport(inputDevice: AudioDeviceInfo, outputDevice: AudioDeviceInfo): Int {
    var score = when (inputDevice.type) {
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_USB_ACCESSORY
      -> 920
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> 840
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> 760
      AudioDeviceInfo.TYPE_BLE_HEADSET -> 720
      AudioDeviceInfo.TYPE_BUILTIN_MIC -> 100
      else -> 0
    }

    if (inputDevice.type == AudioDeviceInfo.TYPE_BUILTIN_MIC && scorePreferredOutputDevice(outputDevice) > 0) {
      score += if (isBluetoothType(outputDevice.type)) 20 else 80
    }

    if (inputDevice.type == AudioDeviceInfo.TYPE_BUILTIN_MIC) {
      score -= 160
    }

    if (isBluetoothType(outputDevice.type) && !isBluetoothType(inputDevice.type) && inputDevice.type != AudioDeviceInfo.TYPE_BUILTIN_MIC) {
      score -= 40
    }

    return score
  }

  private fun supportsStereoInput(device: AudioDeviceInfo): Boolean {
    return isBluetoothType(device.type) && device.channelCounts.any { it >= 2 }
  }

  private fun matchesPreferredDeviceId(preferredId: Int?, device: AudioDeviceInfo): Boolean {
    return preferredId != null && preferredId == device.id
  }

  private fun buildAudioSourceCandidates(inputDevice: AudioDeviceInfo): List<Int> {
    val preferredSources = if (requiresCommunicationRouting(inputDevice)) {
      listOf(
        MediaRecorder.AudioSource.VOICE_RECOGNITION,
        MediaRecorder.AudioSource.MIC,
        MediaRecorder.AudioSource.VOICE_COMMUNICATION,
        MediaRecorder.AudioSource.DEFAULT,
      )
    } else {
      buildList {
        add(MediaRecorder.AudioSource.UNPROCESSED)
        if (inputDevice.type == AudioDeviceInfo.TYPE_BUILTIN_MIC || supportsStereoInput(inputDevice)) {
          add(MediaRecorder.AudioSource.CAMCORDER)
        }
        add(MediaRecorder.AudioSource.MIC)
        add(MediaRecorder.AudioSource.VOICE_RECOGNITION)
        add(MediaRecorder.AudioSource.DEFAULT)
      }
    }

    return preferredSources.distinct()
  }

  private fun configureInputEffects(record: AudioRecord): ManagedInputEffects {
    val sessionId = record.audioSessionId
    return ManagedInputEffects(
      acousticEchoCanceler = AcousticEchoCanceler.create(sessionId)?.apply { enabled = false },
      automaticGainControl = AutomaticGainControl.create(sessionId)?.apply { enabled = false },
      noiseSuppressor = NoiseSuppressor.create(sessionId)?.apply { enabled = false },
    )
  }

  private fun resolveRuntimeInputChannels(
    record: AudioRecord,
    inputDevice: AudioDeviceInfo,
    requestedChannels: Int,
  ): Int {
    if (requestedChannels < 2) {
      return 1
    }

    val actualChannels = max(record.channelCount, 1)
    return if (actualChannels >= 2 && supportsStereoInput(inputDevice)) 2 else 1
  }

  private fun requiresCommunicationRouting(inputDevice: AudioDeviceInfo): Boolean {
    return when (inputDevice.type) {
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_BLE_HEADSET
      -> true
      else -> false
    }
  }

  private fun isSupportedInputType(type: Int): Boolean {
    return isSupportedHeadsetInputType(type) || type == AudioDeviceInfo.TYPE_BUILTIN_MIC
  }

  private fun isSupportedHeadsetInputType(type: Int): Boolean {
    return when (type) {
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_USB_HEADSET,
      AudioDeviceInfo.TYPE_USB_DEVICE,
      AudioDeviceInfo.TYPE_USB_ACCESSORY
      -> true
      else -> false
    }
  }

  private fun findCommunicationDevice(device: AudioDeviceInfo): AudioDeviceInfo? {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
      return null
    }

    return audioManager.availableCommunicationDevices.firstOrNull { it.id == device.id }
  }

  private fun isHeadsetType(type: Int): Boolean {
    return when (type) {
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
      AudioDeviceInfo.TYPE_WIRED_HEADSET,
      AudioDeviceInfo.TYPE_USB_HEADSET
      -> true
      else -> false
    }
  }

  private fun isBluetoothType(type: Int): Boolean {
    return when (type) {
      AudioDeviceInfo.TYPE_BLE_HEADSET,
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP,
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO
      -> true
      else -> false
    }
  }

  private fun buildStatusLocked(): Map<String, Any?> {
    return mapOf(
      "stage" to currentStage,
      "running" to (currentStage == "running" || currentStage == "starting"),
      "inputMode" to if (activeInputChannels >= 2) "stereo" else "mono",
      "usingSharedInput" to (activeInputChannels < 2),
      "sampleRate" to activeSampleRate,
      "bufferFrames" to activeBufferFrames,
      "selectedInput" to deviceToMap(selectedInput),
      "selectedOutput" to deviceToMap(selectedOutput),
      "availableInputs" to listSupportedInputDevicesLocked().map(::deviceToMap),
      "availableOutputs" to listCandidateOutputDevicesLocked().map(::deviceToMap),
      "lastError" to lastError,
    )
  }

  private fun buildBufferedAudioStatusLocked(): Map<String, Any?> {
    val sampleRate = rollingBufferSampleRate
    val bufferedSeconds = if (sampleRate != null && sampleRate > 0) {
      rollingBufferSampleCount.toDouble() / sampleRate.toDouble()
    } else {
      0.0
    }
    val recentWindowActive = recentInputAtMs > 0L && (System.currentTimeMillis() - recentInputAtMs) <= RECENT_INPUT_WINDOW_MS
    val visibleRecentInputLevel = if (recentWindowActive) recentInputLevel.toDouble() else 0.0

    return mapOf(
      "isRecording" to (currentStage == "running" || currentStage == "starting"),
      "bufferedSeconds" to bufferedSeconds,
      "maxBufferSeconds" to ROLLING_BUFFER_MAX_SECONDS,
      "recentInputLevel" to visibleRecentInputLevel,
      "hasRecentInput" to (recentWindowActive && visibleRecentInputLevel >= RECENT_INPUT_THRESHOLD),
    )
  }

  private fun emitAndReturnStatusLocked(): Map<String, Any?> {
    val status = buildStatusLocked()
    onStatusChange(status)
    return status
  }

  private fun emitStatus() {
    synchronized(lock) {
      emitStatusLocked()
    }
  }

  private fun emitStatusLocked() {
    onStatusChange(buildStatusLocked())
  }

  private fun prepareRollingBufferLocked(sampleRate: Int) {
    val capacity = (sampleRate * ROLLING_BUFFER_MAX_SECONDS).coerceAtLeast(sampleRate)
    if (rollingBuffer.size != capacity) {
      rollingBuffer = ShortArray(capacity)
    }
    rollingBufferSampleRate = sampleRate
    rollingBufferWriteIndex = 0
    rollingBufferSampleCount = 0
    recentInputLevel = 0f
    recentInputAtMs = 0L
  }

  private fun clearBufferedAudioLocked(resetFormat: Boolean) {
    if (rollingBuffer.isNotEmpty()) {
      rollingBuffer.fill(0)
    }
    rollingBufferWriteIndex = 0
    rollingBufferSampleCount = 0
    recentInputLevel = 0f
    recentInputAtMs = 0L
    if (resetFormat) {
      rollingBufferSampleRate = null
      rollingBuffer = ShortArray(0)
    }
  }

  private fun appendRollingAudioLocked(samples: ShortArray, sampleCount: Int, peakLevel: Float) {
    if (rollingBuffer.isEmpty() || sampleCount <= 0) {
      return
    }

    for (index in 0 until sampleCount) {
      rollingBuffer[rollingBufferWriteIndex] = samples[index]
      rollingBufferWriteIndex = (rollingBufferWriteIndex + 1) % rollingBuffer.size
      if (rollingBufferSampleCount < rollingBuffer.size) {
        rollingBufferSampleCount += 1
      }
    }

    recentInputLevel = peakLevel.coerceIn(0f, 1f)
    if (peakLevel >= RECENT_INPUT_THRESHOLD) {
      recentInputAtMs = System.currentTimeMillis()
    }
  }

  private fun copyBufferedAudioLocked(): ShortArray {
    val sampleCount = rollingBufferSampleCount
    if (sampleCount <= 0 || rollingBuffer.isEmpty()) {
      return ShortArray(0)
    }

    val copy = ShortArray(sampleCount)
    val startIndex = if (sampleCount == rollingBuffer.size) rollingBufferWriteIndex else 0

    for (index in 0 until sampleCount) {
      copy[index] = rollingBuffer[(startIndex + index) % rollingBuffer.size]
    }

    return copy
  }

  private fun clearActiveRouteLocked() {
    activeInputChannels = 1
    activeSampleRate = null
    activeBufferFrames = null
    selectedInput = null
    selectedOutput = null
  }

  private fun deviceToMap(device: AudioDeviceInfo?): Map<String, Any?>? {
    if (device == null) {
      return null
    }

    val channelCounts = device.channelCounts.filter { it > 0 }
    val sampleRates = device.sampleRates.filter { it > 0 }

    return mapOf(
      "id" to device.id,
      "name" to deviceName(device),
      "type" to deviceTypeKey(device.type),
      "typeLabel" to deviceTypeLabel(device.type),
      "channelCounts" to channelCounts,
      "sampleRates" to sampleRates,
      "isBluetooth" to isBluetoothType(device.type),
      "isHeadset" to (isHeadsetType(device.type) || isSupportedHeadsetInputType(device.type)),
    )
  }

  private fun deviceName(device: AudioDeviceInfo): String {
    val productName = device.productName?.toString()?.trim().orEmpty()
    return productName.ifBlank { deviceTypeLabel(device.type) }
  }

  private fun deviceTypeKey(type: Int): String {
    return when (type) {
      AudioDeviceInfo.TYPE_BLE_HEADSET -> "ble-headset"
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth-a2dp"
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth-sco"
      AudioDeviceInfo.TYPE_USB_ACCESSORY -> "usb-accessory"
      AudioDeviceInfo.TYPE_USB_DEVICE -> "usb-device"
      AudioDeviceInfo.TYPE_USB_HEADSET -> "usb-headset"
      AudioDeviceInfo.TYPE_BUILTIN_MIC -> "built-in-mic"
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired-headphones"
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired-headset"
      else -> "other"
    }
  }

  private fun deviceTypeLabel(type: Int): String {
    return when (type) {
      AudioDeviceInfo.TYPE_BLE_HEADSET -> "BLE headset"
      AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "Bluetooth headphones"
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "Bluetooth headset"
      AudioDeviceInfo.TYPE_USB_ACCESSORY -> "USB accessory"
      AudioDeviceInfo.TYPE_USB_DEVICE -> "USB audio"
      AudioDeviceInfo.TYPE_USB_HEADSET -> "USB headset"
      AudioDeviceInfo.TYPE_BUILTIN_MIC -> "Phone microphone"
      AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "Wired headphones"
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> "Wired headset"
      else -> "Audio device"
    }
  }

  private fun parseConfig(configJson: String): HearingSupportConfig {
    val json = JSONObject(configJson)
    val pointsJson = json.optJSONArray("points")
    val points = buildList {
      if (pointsJson != null) {
        for (index in 0 until pointsJson.length()) {
          val pointJson = pointsJson.optJSONObject(index) ?: continue
          val ear = pointJson.optString("ear", "").lowercase()
          val frequency = pointJson.optDouble("frequency", 0.0)
          val lossDb = pointJson.optDouble("lossDb", 0.0)
          if ((ear == "left" || ear == "right") && frequency > 0.0) {
            add(HearingPointConfig(ear, frequency, max(0.0, lossDb)))
          }
        }
      }
    }

    val maxGainDb = json.optDouble("maxGainDb", DEFAULT_MAX_GAIN_DB).coerceIn(0.0, DEFAULT_MAX_GAIN_DB)
    val bandCount = json.optInt("bandCount", DEFAULT_BAND_COUNT).coerceIn(MIN_BAND_COUNT, MAX_BAND_COUNT)
    val baseGainDb = json.optDouble("baseGainDb", 6.0).coerceIn(0.0, DEFAULT_MAX_GAIN_DB)
    val boostMultiplier = json.optDouble("boostMultiplier", 1.0).coerceIn(0.5, 2.2)
    val preferredInputId = optPreferredDeviceId(json, "preferredInputId")
    val preferredOutputId = optPreferredDeviceId(json, "preferredOutputId")
    return HearingSupportConfig(points, maxGainDb, bandCount, baseGainDb, boostMultiplier, preferredInputId, preferredOutputId)
  }

  private fun optPreferredDeviceId(json: JSONObject, key: String): Int? {
    if (!json.has(key) || json.isNull(key)) {
      return null
    }

    return json.optInt(key).takeIf { it > 0 }
  }

  private fun pointsForEar(points: List<HearingPointConfig>, ear: String): List<GainPoint> {
    return points.filter { it.ear == ear }
      .sortedBy { it.frequencyHz }
      .map { GainPoint(it.frequencyHz, it.lossDb) }
  }

  private fun writeWavFile(file: File, samples: ShortArray, sampleRate: Int) {
    val dataSize = samples.size * SHORT_BYTES
    val header = ByteArray(44)
    writeAscii(header, 0, "RIFF")
    writeInt32LE(header, 4, 36 + dataSize)
    writeAscii(header, 8, "WAVE")
    writeAscii(header, 12, "fmt ")
    writeInt32LE(header, 16, 16)
    writeInt16LE(header, 20, 1)
    writeInt16LE(header, 22, 1)
    writeInt32LE(header, 24, sampleRate)
    writeInt32LE(header, 28, sampleRate * SHORT_BYTES)
    writeInt16LE(header, 32, SHORT_BYTES)
    writeInt16LE(header, 34, 16)
    writeAscii(header, 36, "data")
    writeInt32LE(header, 40, dataSize)

    FileOutputStream(file).use { output ->
      output.write(header)

      val payload = ByteArray(dataSize)
      var offset = 0
      for (sample in samples) {
        payload[offset] = (sample.toInt() and 0xFF).toByte()
        payload[offset + 1] = ((sample.toInt() shr 8) and 0xFF).toByte()
        offset += SHORT_BYTES
      }

      output.write(payload)
      output.flush()
    }
  }

  private fun writeAscii(target: ByteArray, offset: Int, value: String) {
    for (index in value.indices) {
      target[offset + index] = value[index].code.toByte()
    }
  }

  private fun writeInt16LE(target: ByteArray, offset: Int, value: Int) {
    target[offset] = (value and 0xFF).toByte()
    target[offset + 1] = ((value shr 8) and 0xFF).toByte()
  }

  private fun writeInt32LE(target: ByteArray, offset: Int, value: Int) {
    target[offset] = (value and 0xFF).toByte()
    target[offset + 1] = ((value shr 8) and 0xFF).toByte()
    target[offset + 2] = ((value shr 16) and 0xFF).toByte()
    target[offset + 3] = ((value shr 24) and 0xFF).toByte()
  }

  private fun readFromRecord(record: AudioRecord, buffer: ShortArray): Int {
    return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      record.read(buffer, 0, buffer.size, AudioRecord.READ_BLOCKING)
    } else {
      record.read(buffer, 0, buffer.size)
    }
  }

  private fun writeToTrack(track: AudioTrack, buffer: ShortArray, sampleCount: Int) {
    var written = 0

    while (written < sampleCount && isRunning()) {
      val justWritten = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        track.write(buffer, written, sampleCount - written, AudioTrack.WRITE_BLOCKING)
      } else {
        track.write(buffer, written, sampleCount - written)
      }

      if (justWritten <= 0) {
        throw IllegalStateException("Headphone playback stopped unexpectedly ($justWritten).")
      }

      written += justWritten
    }
  }

  private fun stopRecord(record: AudioRecord?) {
    if (record == null) {
      return
    }

    try {
      if (record.recordingState == AudioRecord.RECORDSTATE_RECORDING) {
        record.stop()
      }
    } catch (_: Throwable) {
    }
  }

  private fun stopTrack(track: AudioTrack?) {
    if (track == null) {
      return
    }

    try {
      if (track.playState == AudioTrack.PLAYSTATE_PLAYING) {
        track.pause()
      }
      track.flush()
    } catch (_: Throwable) {
    }
  }

  private fun isRunning(): Boolean {
    synchronized(lock) {
      return running
    }
  }

  private fun pcm16ToFloat(sample: Short): Float {
    return sample / 32768f
  }

  private fun floatToPcm16(sample: Float): Short {
    return (sample.coerceIn(-1f, 1f) * Short.MAX_VALUE).toInt().toShort()
  }

  private fun clampAudio(sample: Float): Float {
    return sample.coerceIn(-1f, 1f)
  }

  private fun dbToLinear(gainDb: Double): Float {
    return Math.pow(10.0, gainDb / 20.0).toFloat()
  }
}

private data class HearingPointConfig(
  val ear: String,
  val frequencyHz: Double,
  val lossDb: Double,
)

private data class HearingSupportConfig(
  val points: List<HearingPointConfig>,
  val maxGainDb: Double,
  val bandCount: Int,
  val baseGainDb: Double,
  val boostMultiplier: Double,
  val preferredInputId: Int?,
  val preferredOutputId: Int?,
)

private data class AudioFormatChoice(
  val sampleRate: Int,
  val inputChannels: Int,
  val recordBufferFrames: Int,
  val trackBufferFrames: Int,
  val processingChunkFrames: Int,
)

private data class SelectedAudioRoute(
  val inputDevice: AudioDeviceInfo,
  val outputDevice: AudioDeviceInfo,
)

private data class ScoredRoute(
  val inputDevice: AudioDeviceInfo,
  val outputDevice: AudioDeviceInfo,
  val score: Int,
)

private data class ManagedInputEffects(
  val acousticEchoCanceler: AcousticEchoCanceler?,
  val automaticGainControl: AutomaticGainControl?,
  val noiseSuppressor: NoiseSuppressor?,
) {
  fun release() {
    acousticEchoCanceler?.release()
    automaticGainControl?.release()
    noiseSuppressor?.release()
  }
}

private data class GainPoint(
  val frequencyHz: Double,
  val gainDb: Double,
)

private data class StereoFilterBank(
  val left: FilterBank,
  val right: FilterBank,
  val shared: FilterBank,
)

private class GainCurve(
  points: List<GainPoint>,
  private val maxGainDb: Double,
  private val boostMultiplier: Double,
) {
  private val sortedPoints = points.sortedBy { it.frequencyHz }

  fun gainFor(frequencyHz: Double): Double {
    if (sortedPoints.isEmpty()) {
      return 0.0
    }

    val clampedFrequency = frequencyHz.coerceIn(sortedPoints.first().frequencyHz, sortedPoints.last().frequencyHz)
    val lowerIndex = sortedPoints.indexOfLast { it.frequencyHz <= clampedFrequency }

    if (lowerIndex <= -1) {
      return scaleAndClamp(sortedPoints.first().gainDb)
    }

    if (lowerIndex >= sortedPoints.lastIndex) {
      return scaleAndClamp(sortedPoints.last().gainDb)
    }

    val lower = sortedPoints[lowerIndex]
    val upper = sortedPoints[lowerIndex + 1]
    if (upper.frequencyHz <= lower.frequencyHz) {
      return scaleAndClamp(lower.gainDb)
    }

    val lowerLog = ln(lower.frequencyHz)
    val upperLog = ln(upper.frequencyHz)
    val frequencyLog = ln(clampedFrequency)
    val ratio = ((frequencyLog - lowerLog) / (upperLog - lowerLog)).coerceIn(0.0, 1.0)
    val interpolatedGain = lower.gainDb + (upper.gainDb - lower.gainDb) * ratio
    return scaleAndClamp(interpolatedGain)
  }

  private fun scaleAndClamp(gainDb: Double): Double {
    val scaledMaxGain = (maxGainDb * boostMultiplier).coerceAtLeast(0.0)
    return (gainDb * boostMultiplier).coerceIn(0.0, scaledMaxGain)
  }
}
