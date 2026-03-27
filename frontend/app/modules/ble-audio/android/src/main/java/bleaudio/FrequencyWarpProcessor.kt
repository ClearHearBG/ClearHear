package bleaudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.floor
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

private const val SOURCE_MIN_FREQUENCY_HZ = 20.0
private const val SOURCE_MAX_FREQUENCY_HZ = 20000.0
private const val LOW_BAND_TARGET_MAX_HZ = 500.0
private const val IMPORTANT_HIGH_FREQUENCY_HZ = 8000.0
private const val MIN_HEARING_RANGE_SPAN_HZ = 80.0
private const val SPECTRAL_WINDOW_SIZE = 1024
private const val SPECTRAL_HOP_SIZE = SPECTRAL_WINDOW_SIZE / 4
private const val INVERSE_MAP_EPSILON = 1e-6
private const val NORMALIZATION_EPSILON = 1e-9

internal data class HearingRangeConfig(
  val ear: String,
  val minFrequencyHz: Double?,
  val maxFrequencyHz: Double?,
)

internal data class HearingFrequencyRange(
  val minFrequencyHz: Double,
  val maxFrequencyHz: Double,
) {
  companion object {
    fun normalized(minFrequencyHz: Double?, maxFrequencyHz: Double?): HearingFrequencyRange? {
      val safeMin = minFrequencyHz
        ?.takeIf { it.isFinite() }
        ?.coerceIn(SOURCE_MIN_FREQUENCY_HZ, SOURCE_MAX_FREQUENCY_HZ)
        ?: return null
      val safeMaxFloor = (safeMin + 1.0).coerceAtMost(SOURCE_MAX_FREQUENCY_HZ)
      val safeMax = maxFrequencyHz
        ?.takeIf { it.isFinite() }
        ?.coerceIn(safeMaxFloor, SOURCE_MAX_FREQUENCY_HZ)
        ?: return null

      return HearingFrequencyRange(
        minFrequencyHz = safeMin,
        maxFrequencyHz = max(safeMax, (safeMin + MIN_HEARING_RANGE_SPAN_HZ).coerceAtMost(SOURCE_MAX_FREQUENCY_HZ)),
      )
    }
  }
}

internal class StereoAudioProcessor(
  sampleRate: Int,
  leftRange: HearingFrequencyRange?,
  rightRange: HearingFrequencyRange?,
  sharedRange: HearingFrequencyRange?,
  filterBanks: StereoFilterBank,
  outputGain: Float,
) {
  private val leftProcessor = ChannelAudioProcessor(sampleRate, leftRange, filterBanks.left, outputGain)
  private val rightProcessor = ChannelAudioProcessor(sampleRate, rightRange, filterBanks.right, outputGain)
  private val sharedProcessor = ChannelAudioProcessor(sampleRate, sharedRange, filterBanks.shared, outputGain)

  fun processStereo(
    leftInput: FloatArray,
    rightInput: FloatArray,
    frameCount: Int,
    leftOutput: FloatArray,
    rightOutput: FloatArray,
  ) {
    leftProcessor.process(leftInput, frameCount, leftOutput)
    rightProcessor.process(rightInput, frameCount, rightOutput)
  }

  fun processMono(
    input: FloatArray,
    frameCount: Int,
    leftOutput: FloatArray,
    rightOutput: FloatArray,
  ) {
    sharedProcessor.process(input, frameCount, leftOutput)
    System.arraycopy(leftOutput, 0, rightOutput, 0, frameCount)
  }
}

internal class ChannelAudioProcessor(
  sampleRate: Int,
  hearingRange: HearingFrequencyRange?,
  private val filterBank: FilterBank,
  private val outputGain: Float,
) {
  private val spectralProcessor = hearingRange?.let { FrequencyWarpStreamProcessor(sampleRate, it) }
  private var spectralScratch = FloatArray(0)

  fun process(input: FloatArray, frameCount: Int, output: FloatArray) {
    if (spectralScratch.size < frameCount) {
      spectralScratch = FloatArray(frameCount)
    }

    val processedInput = if (spectralProcessor != null) {
      spectralProcessor.process(input, frameCount, spectralScratch)
      spectralScratch
    } else {
      input
    }

    for (index in 0 until frameCount) {
      output[index] = (filterBank.process(processedInput[index]) * outputGain).coerceIn(-1f, 1f)
    }
  }
}

internal class FrequencyWarpStreamProcessor(
  sampleRate: Int,
  hearingRange: HearingFrequencyRange,
) {
  private val fftSize = SPECTRAL_WINDOW_SIZE
  private val hopSize = SPECTRAL_HOP_SIZE
  private val positiveBinCount = fftSize / 2 + 1
  private val binResolutionHz = sampleRate.toDouble() / fftSize.toDouble()
  private val analysisWindow = DoubleArray(fftSize) { index ->
    val hann = 0.5 - 0.5 * cos((2.0 * PI * index) / (fftSize - 1).toDouble())
    sqrt(hann.coerceAtLeast(0.0))
  }
  private val windowPower = DoubleArray(fftSize) { index -> analysisWindow[index] * analysisWindow[index] }
  private val inputHistory = DoubleArray(fftSize)
  private val outputAccumulator = DoubleArray(fftSize)
  private val normalizationAccumulator = DoubleArray(fftSize)
  private val fftReal = DoubleArray(fftSize)
  private val fftImag = DoubleArray(fftSize)
  private val positiveReal = DoubleArray(positiveBinCount)
  private val positiveImag = DoubleArray(positiveBinCount)
  private val warpedPositiveReal = DoubleArray(positiveBinCount)
  private val warpedPositiveImag = DoubleArray(positiveBinCount)
  private val inputQueue = FloatSampleQueue(hopSize * 4)
  private val outputQueue = FloatSampleQueue(hopSize * 6)
  private val hopInput = FloatArray(hopSize)
  private val hopOutput = FloatArray(hopSize)
  private val mappedInputBinPositions = buildInverseFrequencyMap(hearingRange)

  fun process(input: FloatArray, frameCount: Int, output: FloatArray) {
    inputQueue.pushAll(input, frameCount)

    while (inputQueue.size >= hopSize) {
      inputQueue.popInto(hopInput, hopSize)
      System.arraycopy(inputHistory, hopSize, inputHistory, 0, fftSize - hopSize)

      for (index in 0 until hopSize) {
        inputHistory[fftSize - hopSize + index] = hopInput[index].toDouble()
      }

      processWindow()
      emitHop()
    }

    outputQueue.popInto(output, frameCount)
  }

  private fun processWindow() {
    for (index in 0 until fftSize) {
      fftReal[index] = inputHistory[index] * analysisWindow[index]
      fftImag[index] = 0.0
    }

    fft(fftReal, fftImag, inverse = false)

    for (binIndex in 0 until positiveBinCount) {
      positiveReal[binIndex] = fftReal[binIndex]
      positiveImag[binIndex] = fftImag[binIndex]
    }

    for (binIndex in 0 until positiveBinCount) {
      val mappedPosition = mappedInputBinPositions[binIndex]
      warpedPositiveReal[binIndex] = sampleInterpolated(positiveReal, mappedPosition)
      warpedPositiveImag[binIndex] = sampleInterpolated(positiveImag, mappedPosition)
    }

    fftReal.fill(0.0)
    fftImag.fill(0.0)

    for (binIndex in 0 until positiveBinCount) {
      fftReal[binIndex] = warpedPositiveReal[binIndex]
      fftImag[binIndex] = warpedPositiveImag[binIndex]
    }

    for (binIndex in 1 until positiveBinCount - 1) {
      val mirroredIndex = fftSize - binIndex
      fftReal[mirroredIndex] = warpedPositiveReal[binIndex]
      fftImag[mirroredIndex] = -warpedPositiveImag[binIndex]
    }

    fft(fftReal, fftImag, inverse = true)

    for (index in 0 until fftSize) {
      val windowedSample = fftReal[index] * analysisWindow[index]
      outputAccumulator[index] += windowedSample
      normalizationAccumulator[index] += windowPower[index]
    }
  }

  private fun emitHop() {
    for (index in 0 until hopSize) {
      val normalization = normalizationAccumulator[index]
      hopOutput[index] = if (normalization > NORMALIZATION_EPSILON) {
        (outputAccumulator[index] / normalization).toFloat()
      } else {
        0f
      }
    }

    outputQueue.pushAll(hopOutput, hopSize)

    System.arraycopy(outputAccumulator, hopSize, outputAccumulator, 0, fftSize - hopSize)
    System.arraycopy(normalizationAccumulator, hopSize, normalizationAccumulator, 0, fftSize - hopSize)
    outputAccumulator.fill(0.0, fftSize - hopSize, fftSize)
    normalizationAccumulator.fill(0.0, fftSize - hopSize, fftSize)
  }

  private fun buildInverseFrequencyMap(hearingRange: HearingFrequencyRange): DoubleArray {
    val frequencies = DoubleArray(positiveBinCount) { index -> index * binResolutionHz }
    val nyquistHz = frequencies.last()
    val sourceMaxHz = min(SOURCE_MAX_FREQUENCY_HZ, nyquistHz)
    val normalizedRange = HearingFrequencyRange(
      minFrequencyHz = hearingRange.minFrequencyHz.coerceIn(SOURCE_MIN_FREQUENCY_HZ, sourceMaxHz),
      maxFrequencyHz = hearingRange.maxFrequencyHz.coerceIn((hearingRange.minFrequencyHz + 1.0).coerceAtMost(sourceMaxHz), sourceMaxHz),
    )
    val lowBandTargetMaxHz = computeLowBandTargetMax(normalizedRange)
    val highBandTargetMinHz = computeHighBandTargetMin(normalizedRange)
    val outputCurve = frequencies.copyOf()

    for (index in outputCurve.indices) {
      val frequency = frequencies[index]

      outputCurve[index] = when {
        frequency < normalizedRange.minFrequencyHz -> logSpaceMap(
          value = frequency,
          sourceLowHz = SOURCE_MIN_FREQUENCY_HZ,
          sourceHighHz = normalizedRange.minFrequencyHz,
          targetLowHz = normalizedRange.minFrequencyHz,
          targetHighHz = lowBandTargetMaxHz,
        )
        frequency > normalizedRange.maxFrequencyHz -> logSpaceMap(
          value = frequency,
          sourceLowHz = normalizedRange.maxFrequencyHz,
          sourceHighHz = sourceMaxHz,
          targetLowHz = highBandTargetMinHz,
          targetHighHz = normalizedRange.maxFrequencyHz,
        )
        else -> frequency
      }
    }

    for (index in 1 until outputCurve.size) {
      outputCurve[index] = max(outputCurve[index], outputCurve[index - 1])
    }

    val curveWithEpsilon = DoubleArray(outputCurve.size) { index ->
      outputCurve[index] + (INVERSE_MAP_EPSILON * index / outputCurve.size.toDouble())
    }

    return DoubleArray(positiveBinCount) { index ->
      val sourceFrequency = interpolateInverseFrequency(curveWithEpsilon, frequencies, frequencies[index])

      if (sourceFrequency <= 0.0) {
        -1.0
      } else {
        sourceFrequency / binResolutionHz
      }
    }
  }

  private fun computeLowBandTargetMax(hearingRange: HearingFrequencyRange): Double {
    val span = max(hearingRange.maxFrequencyHz - hearingRange.minFrequencyHz, 0.0)
    val candidate = min(
      max(LOW_BAND_TARGET_MAX_HZ, hearingRange.minFrequencyHz * 1.5),
      hearingRange.minFrequencyHz + span * 0.18,
    )

    return candidate.coerceIn(hearingRange.minFrequencyHz, hearingRange.maxFrequencyHz)
  }

  private fun computeHighBandTargetMin(hearingRange: HearingFrequencyRange): Double {
    val span = max(hearingRange.maxFrequencyHz - hearingRange.minFrequencyHz, 0.0)
    val candidate = if (hearingRange.maxFrequencyHz >= IMPORTANT_HIGH_FREQUENCY_HZ) {
      IMPORTANT_HIGH_FREQUENCY_HZ
    } else {
      hearingRange.minFrequencyHz + span * 0.82
    }

    return candidate.coerceIn(hearingRange.minFrequencyHz, hearingRange.maxFrequencyHz)
  }
}

private class FloatSampleQueue(initialCapacity: Int) {
  private var buffer = FloatArray(max(initialCapacity, 1))

  var size: Int = 0
    private set

  fun pushAll(input: FloatArray, count: Int) {
    if (count <= 0) {
      return
    }

    ensureCapacity(size + count)
    System.arraycopy(input, 0, buffer, size, count)
    size += count
  }

  fun popInto(target: FloatArray, count: Int) {
    val actualCount = min(count, size)

    if (actualCount > 0) {
      System.arraycopy(buffer, 0, target, 0, actualCount)
    }

    if (actualCount < count) {
      target.fill(0f, actualCount, count)
    }

    if (actualCount < size) {
      System.arraycopy(buffer, actualCount, buffer, 0, size - actualCount)
    }

    size -= actualCount
  }

  private fun ensureCapacity(requiredSize: Int) {
    if (requiredSize <= buffer.size) {
      return
    }

    var nextCapacity = buffer.size

    while (nextCapacity < requiredSize) {
      nextCapacity *= 2
    }

    buffer = buffer.copyOf(nextCapacity)
  }
}

private fun interpolateInverseFrequency(
  outputCurve: DoubleArray,
  sourceFrequencies: DoubleArray,
  targetFrequency: Double,
): Double {
  if (outputCurve.isEmpty()) {
    return -1.0
  }

  if (targetFrequency < outputCurve.first() || targetFrequency > outputCurve.last()) {
    return -1.0
  }

  var lowerIndex = 0
  var upperIndex = outputCurve.lastIndex

  while (lowerIndex < upperIndex) {
    val middleIndex = (lowerIndex + upperIndex) / 2

    if (outputCurve[middleIndex] < targetFrequency) {
      lowerIndex = middleIndex + 1
    } else {
      upperIndex = middleIndex
    }
  }

  if (lowerIndex == 0) {
    return sourceFrequencies[0]
  }

  val previousIndex = lowerIndex - 1
  val lowerCurve = outputCurve[previousIndex]
  val upperCurve = outputCurve[lowerIndex]

  if (upperCurve <= lowerCurve) {
    return sourceFrequencies[lowerIndex]
  }

  val ratio = ((targetFrequency - lowerCurve) / (upperCurve - lowerCurve)).coerceIn(0.0, 1.0)
  return sourceFrequencies[previousIndex] + (sourceFrequencies[lowerIndex] - sourceFrequencies[previousIndex]) * ratio
}

private fun logSpaceMap(
  value: Double,
  sourceLowHz: Double,
  sourceHighHz: Double,
  targetLowHz: Double,
  targetHighHz: Double,
): Double {
  if (sourceHighHz <= sourceLowHz || targetHighHz <= targetLowHz) {
    return targetLowHz
  }

  val clipped = value.coerceIn(sourceLowHz, sourceHighHz)
  val position = ln(clipped / sourceLowHz) / ln(sourceHighHz / sourceLowHz)
  return targetLowHz * exp(ln(targetHighHz / targetLowHz) * position)
}

private fun sampleInterpolated(values: DoubleArray, position: Double): Double {
  if (position < 0.0) {
    return 0.0
  }

  if (position >= values.lastIndex.toDouble()) {
    return values.last()
  }

  val lowerIndex = floor(position).toInt().coerceIn(0, values.lastIndex)
  val upperIndex = min(lowerIndex + 1, values.lastIndex)
  val ratio = (position - lowerIndex).coerceIn(0.0, 1.0)
  return values[lowerIndex] + (values[upperIndex] - values[lowerIndex]) * ratio
}

private fun fft(real: DoubleArray, imag: DoubleArray, inverse: Boolean) {
  val size = real.size
  var reversedIndex = 0

  for (index in 1 until size) {
    var bit = size shr 1

    while (reversedIndex and bit != 0) {
      reversedIndex = reversedIndex xor bit
      bit = bit shr 1
    }

    reversedIndex = reversedIndex xor bit

    if (index < reversedIndex) {
      val temporaryReal = real[index]
      real[index] = real[reversedIndex]
      real[reversedIndex] = temporaryReal

      val temporaryImag = imag[index]
      imag[index] = imag[reversedIndex]
      imag[reversedIndex] = temporaryImag
    }
  }

  var length = 2

  while (length <= size) {
    val angle = (2.0 * PI / length) * if (inverse) 1.0 else -1.0
    val wLenReal = cos(angle)
    val wLenImag = sin(angle)

    for (start in 0 until size step length) {
      var twiddleReal = 1.0
      var twiddleImag = 0.0

      for (offset in 0 until length / 2) {
        val evenIndex = start + offset
        val oddIndex = evenIndex + length / 2
        val oddReal = real[oddIndex] * twiddleReal - imag[oddIndex] * twiddleImag
        val oddImag = real[oddIndex] * twiddleImag + imag[oddIndex] * twiddleReal
        val evenReal = real[evenIndex]
        val evenImag = imag[evenIndex]

        real[evenIndex] = evenReal + oddReal
        imag[evenIndex] = evenImag + oddImag
        real[oddIndex] = evenReal - oddReal
        imag[oddIndex] = evenImag - oddImag

        val nextTwiddleReal = twiddleReal * wLenReal - twiddleImag * wLenImag
        twiddleImag = twiddleReal * wLenImag + twiddleImag * wLenReal
        twiddleReal = nextTwiddleReal
      }
    }

    length = length shl 1
  }

  if (inverse) {
    for (index in 0 until size) {
      real[index] /= size.toDouble()
      imag[index] /= size.toDouble()
    }
  }
}
