package expo.modules.ramupingps

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.google.android.gms.location.ActivityRecognitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * 구글 Play 서비스가 "지금 걷는 중/차 안/가만히 있음"을 알려줄 때 받는 곳 (WBS 2.3, 8.6).
 *
 * 위치만으로는 알 수 없는 것을 채웁니다. 실내에서 쓰러져 있으면 좌표는 그대로라
 * "안 움직인다"를 위치로는 구분할 수 없는데, 이 값이 있으면 구분됩니다.
 *
 * 앱이 꺼져 있어도 안드로이드가 이 수신기를 깨우므로, 결과는 기기에 저장해 둡니다.
 */
class ActivityReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (!ActivityRecognitionResult.hasResult(intent)) return
    val result = ActivityRecognitionResult.extractResult(intent) ?: return
    val most = result.mostProbableActivity

    context
      .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_TYPE, typeName(most.type))
      .putInt(KEY_CONFIDENCE, most.confidence)
      .putLong(KEY_AT, result.time)
      .apply()
  }

  companion object {
    const val PREFS = "ramupin-gps-activity"
    const val KEY_TYPE = "type"
    const val KEY_CONFIDENCE = "confidence"
    const val KEY_AT = "detectedAt"

    /** 안드로이드 코드값 → 앱에서 쓰는 이름 */
    fun typeName(type: Int) = when (type) {
      DetectedActivity.STILL -> "still"
      DetectedActivity.WALKING -> "walking"
      DetectedActivity.ON_FOOT -> "walking"
      DetectedActivity.RUNNING -> "running"
      DetectedActivity.ON_BICYCLE -> "bicycle"
      DetectedActivity.IN_VEHICLE -> "vehicle"
      DetectedActivity.TILTING -> "tilting"
      else -> "unknown"
    }
  }
}
