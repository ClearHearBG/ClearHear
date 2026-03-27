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
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.Process
import org.json.JSONObject
import kotlin.math.ln
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

internal class BleAudioEngine(
  context: Context,
  private val onStatusChange: (Map<String, Any?>) -> Unit,
) {
  private val appContext = context.applicationContext
  private val audioManager = appContext.getSystemService(Context.AUDIO_SERVICE) as AudioManager
  private val mainHandler = Handler(Looper.getMainLooper())
  private val lock = Any()

  private var currentConfig = HearingSupportConfig(emptyList(), DEFAULT_MAX_GAIN_DB, DEFAULT_BAND_COUNT)
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

  fun start(configJson: String): Map<String, Any?> {
    val config = parseConfig(configJson)
    stop(clearError = false)

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

      inputDevice = selectPreferredInputDeviceLocked()
        ?: run {
          currentStage = "error"
          lastError = "Connect headphones or earbuds with a microphone to start live hearing support."
          return emitAndReturnStatusLocked()
        }

      formatChoice = chooseAudioFormat(inputDevice)
        ?: run {
          currentStage = "error"
          lastError = "No compatible live-audio format was found for the selected headset microphone."
          return emitAndReturnStatusLocked()
        }

      outputDevice = selectPreferredOutputDeviceLocked(inputDevice)

      try {
        record = buildAudioRecord(inputDevice, formatChoice)
        track = buildAudioTrack(outputDevice, formatChoice)
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
      activeBufferFrames = formatChoice.recordBufferFrames
      selectedInput = inputDevice
      selectedOutput = outputDevice
      audioRecord = record
      audioTrack = track
    }

    val worker = Thread(
      {
        runAudioLoop(record, track, formatChoice, outputDevice)
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
    outputDevice: AudioDeviceInfo?,
  ) {
    Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO)

    var failureMessage: String? = null

    try {
      configureRouting(record, track, outputDevice)
      val filterBanks = buildFilterBanks(currentConfig, formatChoice.sampleRate)
      val inputBuffer = ShortArray(formatChoice.recordBufferFrames * formatChoice.inputChannels)
      val outputBuffer = ShortArray(formatChoice.recordBufferFrames * 2)

      record.startRecording()
      if (record.recordingState != AudioRecord.RECORDSTATE_RECORDING) {
        throw IllegalStateException("Headset microphone capture did not start.")
      }

      track.play()
      if (track.playState != AudioTrack.PLAYSTATE_PLAYING) {
        throw IllegalStateException("Headset audio playback did not start.")
      }

      synchronized(lock) {
        if (running) {
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

        val framesRead = samplesRead / formatChoice.inputChannels
        var inputIndex = 0
        var outputIndex = 0

        for (frame in 0 until framesRead) {
          val inputLeft: Float
          val inputRight: Float

          if (formatChoice.inputChannels == 2 && inputIndex + 1 < samplesRead) {
            inputLeft = pcm16ToFloat(inputBuffer[inputIndex])
            inputRight = pcm16ToFloat(inputBuffer[inputIndex + 1])
            inputIndex += 2
          } else {
            val sharedInput = pcm16ToFloat(inputBuffer[inputIndex])
            inputLeft = sharedInput
            inputRight = sharedInput
            inputIndex += 1
          }

          val outputLeft = clampAudio(filterBanks.left.process(inputLeft) * OUTPUT_HEADROOM)
          val outputRight = clampAudio(filterBanks.right.process(inputRight) * OUTPUT_HEADROOM)

          outputBuffer[outputIndex] = floatToPcm16(outputLeft)
          outputBuffer[outputIndex + 1] = floatToPcm16(outputRight)
          outputIndex += 2
        }

        writeToTrack(track, outputBuffer, framesRead * 2)
      }
    } catch (error: Throwable) {
      if (isRunning()) {
        failureMessage = error.message ?: "Live hearing support stopped unexpectedly."
      }
    } finally {
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

        emitStatusLocked()
      }
    }
  }

  private fun configureRouting(record: AudioRecord, track: AudioTrack, outputDevice: AudioDeviceInfo?) {
    synchronized(lock) {
      if (previousAudioMode == null) {
        previousAudioMode = audioManager.mode
      }
      audioManager.mode = AudioManager.MODE_IN_COMMUNICATION
    }

    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      outputDevice?.let { audioManager.setCommunicationDevice(it) }
    } else if (selectedInput?.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO) {
      @Suppress("DEPRECATION")
      audioManager.startBluetoothSco()
      @Suppress("DEPRECATION")
      audioManager.isBluetoothScoOn = true
      synchronized(lock) {
        bluetoothScoStarted = true
      }
    }

    selectedInput?.let {
      record.setPreferredDevice(it)
    }
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

    val record = AudioRecord.Builder()
      .setAudioSource(MediaRecorder.AudioSource.VOICE_COMMUNICATION)
      .setAudioFormat(audioFormat)
      .setBufferSizeInBytes(formatChoice.recordBufferFrames * formatChoice.inputChannels * SHORT_BYTES)
      .build()

    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      throw IllegalStateException("Could not initialize headset microphone capture.")
    }

    record.setPreferredDevice(inputDevice)
    return record
  }

  private fun buildAudioTrack(outputDevice: AudioDeviceInfo?, formatChoice: AudioFormatChoice): AudioTrack {
    val audioFormat = AudioFormat.Builder()
      .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
      .setSampleRate(formatChoice.sampleRate)
      .setChannelMask(AudioFormat.CHANNEL_OUT_STEREO)
      .build()

    val audioAttributes = AudioAttributes.Builder()
      .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
      .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
      .build()

    val track = AudioTrack.Builder()
      .setAudioAttributes(audioAttributes)
      .setAudioFormat(audioFormat)
      .setTransferMode(AudioTrack.MODE_STREAM)
      .setBufferSizeInBytes(formatChoice.trackBufferFrames * 2 * SHORT_BYTES)
      .build()

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
    val leftCurve = GainCurve(leftFallback, config.maxGainDb)
    val rightCurve = GainCurve(rightFallback, config.maxGainDb)
    val bandCenters = createLogBandCenters(config.bandCount)

    return StereoFilterBank(
      left = createFilterBank(leftCurve, bandCenters, sampleRate),
      right = createFilterBank(rightCurve, bandCenters, sampleRate),
    )
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

        return AudioFormatChoice(
          sampleRate = sampleRate,
          inputChannels = channels,
          recordBufferFrames = bytesToFrames(recordMinBytes, channels),
          trackBufferFrames = bytesToFrames(trackMinBytes, 2),
        )
      }
    }

    return null
  }

  private fun bytesToFrames(bufferBytes: Int, channels: Int): Int {
    val rawFrames = max(256, bufferBytes / (channels * SHORT_BYTES))
    return ((rawFrames + 127) / 128) * 128
  }

  private fun buildSampleRateCandidates(inputDevice: AudioDeviceInfo): List<Int> {
    val candidateRates = linkedSetOf<Int>()
    inputDevice.sampleRates.filter { it > 0 }.forEach(candidateRates::add)
    candidateRates.add(48000)
    candidateRates.add(44100)
    candidateRates.add(32000)
    candidateRates.add(24000)
    candidateRates.add(16000)
    return candidateRates.toList()
  }

  private fun selectPreferredInputDeviceLocked(): AudioDeviceInfo? {
    return listSupportedInputDevicesLocked().maxByOrNull { scoreInputDevice(it) }
  }

  private fun selectPreferredOutputDeviceLocked(inputDevice: AudioDeviceInfo): AudioDeviceInfo? {
    val outputDevices = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      audioManager.availableCommunicationDevices.filter { it.isSink }
    } else {
      audioManager.getDevices(AudioManager.GET_DEVICES_OUTPUTS).filter { it.isSink }
    }

    val scoredOutputs = outputDevices.map { device -> device to scoreOutputDevice(device, inputDevice) }
    return scoredOutputs.maxByOrNull { it.second }?.takeIf { it.second > 0 }?.first
  }

  private fun listSupportedInputDevicesLocked(): List<AudioDeviceInfo> {
    return audioManager.getDevices(AudioManager.GET_DEVICES_INPUTS)
      .filter { it.isSource && isSupportedHeadsetInputType(it.type) }
      .sortedByDescending { scoreInputDevice(it) }
  }

  private fun scoreInputDevice(device: AudioDeviceInfo): Int {
    var score = when (device.type) {
      AudioDeviceInfo.TYPE_BLE_HEADSET -> 600
      AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> 560
      AudioDeviceInfo.TYPE_WIRED_HEADSET -> 520
      AudioDeviceInfo.TYPE_USB_HEADSET -> 480
      AudioDeviceInfo.TYPE_USB_DEVICE -> 430
      AudioDeviceInfo.TYPE_USB_ACCESSORY -> 410
      else -> 0
    }

    if (supportsStereoInput(device)) {
      score += 40
    }

    score += device.channelCounts.maxOrNull() ?: 0
    return score
  }

  private fun scoreOutputDevice(outputDevice: AudioDeviceInfo, inputDevice: AudioDeviceInfo): Int {
    var score = 0

    if (!outputDevice.isSink) {
      return score
    }

    if (outputDevice.type == inputDevice.type) {
      score += 180
    }

    if (isBluetoothType(outputDevice.type) && isBluetoothType(inputDevice.type)) {
      score += 120
    }

    if (isHeadsetType(outputDevice.type)) {
      score += 70
    }

    if (deviceName(outputDevice).equals(deviceName(inputDevice), ignoreCase = true)) {
      score += 40
    }

    return score
  }

  private fun supportsStereoInput(device: AudioDeviceInfo): Boolean {
    return device.channelCounts.any { it >= 2 }
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
      "lastError" to lastError,
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
    return HearingSupportConfig(points, maxGainDb, bandCount)
  }

  private fun pointsForEar(points: List<HearingPointConfig>, ear: String): List<GainPoint> {
    return points.filter { it.ear == ear }
      .sortedBy { it.frequencyHz }
      .map { GainPoint(it.frequencyHz, it.lossDb) }
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
)

private data class AudioFormatChoice(
  val sampleRate: Int,
  val inputChannels: Int,
  val recordBufferFrames: Int,
  val trackBufferFrames: Int,
)

private data class GainPoint(
  val frequencyHz: Double,
  val gainDb: Double,
)

private data class StereoFilterBank(
  val left: FilterBank,
  val right: FilterBank,
)

private class GainCurve(points: List<GainPoint>, private val maxGainDb: Double) {
  private val sortedPoints = points.sortedBy { it.frequencyHz }

  fun gainFor(frequencyHz: Double): Double {
    if (sortedPoints.isEmpty()) {
      return 0.0
    }

    val clampedFrequency = frequencyHz.coerceIn(sortedPoints.first().frequencyHz, sortedPoints.last().frequencyHz)
    val lowerIndex = sortedPoints.indexOfLast { it.frequencyHz <= clampedFrequency }

    if (lowerIndex <= -1) {
      return sortedPoints.first().gainDb.coerceIn(0.0, maxGainDb)
    }

    if (lowerIndex >= sortedPoints.lastIndex) {
      return sortedPoints.last().gainDb.coerceIn(0.0, maxGainDb)
    }

    val lower = sortedPoints[lowerIndex]
    val upper = sortedPoints[lowerIndex + 1]
    if (upper.frequencyHz <= lower.frequencyHz) {
      return lower.gainDb.coerceIn(0.0, maxGainDb)
    }

    val lowerLog = ln(lower.frequencyHz)
    val upperLog = ln(upper.frequencyHz)
    val frequencyLog = ln(clampedFrequency)
    val ratio = ((frequencyLog - lowerLog) / (upperLog - lowerLog)).coerceIn(0.0, 1.0)
    val interpolatedGain = lower.gainDb + (upper.gainDb - lower.gainDb) * ratio
    return interpolatedGain.coerceIn(0.0, maxGainDb)
  }
}
