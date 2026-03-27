package bleaudio

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

internal data class BiquadCoefficients(
  val b0: Double,
  val b1: Double,
  val b2: Double,
  val a1: Double,
  val a2: Double,
) {
  companion object {
    fun peaking(sampleRate: Double, centerFrequencyHz: Double, q: Double, gainDb: Double): BiquadCoefficients {
      val amplitude = Math.pow(10.0, gainDb / 40.0)
      val omega = (2.0 * PI * centerFrequencyHz) / sampleRate
      val alpha = sin(omega) / (2.0 * q)
      val cosine = cos(omega)

      val rawB0 = 1.0 + alpha * amplitude
      val rawB1 = -2.0 * cosine
      val rawB2 = 1.0 - alpha * amplitude
      val rawA0 = 1.0 + alpha / amplitude
      val rawA1 = -2.0 * cosine
      val rawA2 = 1.0 - alpha / amplitude

      return BiquadCoefficients(
        b0 = rawB0 / rawA0,
        b1 = rawB1 / rawA0,
        b2 = rawB2 / rawA0,
        a1 = rawA1 / rawA0,
        a2 = rawA2 / rawA0,
      )
    }
  }
}

internal class BiquadFilter(private val coefficients: BiquadCoefficients) {
  private var x1 = 0.0
  private var x2 = 0.0
  private var y1 = 0.0
  private var y2 = 0.0

  fun process(sample: Float): Float {
    val input = sample.toDouble()
    val output =
      coefficients.b0 * input +
        coefficients.b1 * x1 +
        coefficients.b2 * x2 -
        coefficients.a1 * y1 -
        coefficients.a2 * y2

    x2 = x1
    x1 = input
    y2 = y1
    y1 = output

    return output.toFloat()
  }
}

internal class FilterBank(private val filters: List<BiquadFilter>) {
  fun process(sample: Float): Float {
    var output = sample
    for (filter in filters) {
      output = filter.process(output)
    }
    return output
  }
}
