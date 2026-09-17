package expo.modules.ramupingps

import android.Manifest
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.location.GnssStatus
import android.location.LocationManager
import android.os.Build
import android.os.Handler
import com.google.android.gms.location.ActivityRecognition
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * GPS 부가 정보 (WBS 2.2·2.3).
 *
 * expo-location 은 위경도·정확도·속도까지만 줍니다.
 * WBS 가 요구하는 "위성 수, 신호 강도, 위치 제공자"는 안드로이드 API 를 직접 불러야 합니다.
 *
 * 위성 정보는 계속 흘러나오는 값이라, 콜백을 등록해 마지막 값을 들고 있다가
 * 위치를 서버로 보낼 때 함께 담습니다.
 */
class RamupinGpsModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private val locationManager: LocationManager
    get() = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager

  /** 마지막으로 받은 위성 상태. 콜백이 갱신하고 getSatellites() 가 읽습니다 */
  @Volatile private var lastSatellites: SatelliteInfo? = null
  private var callback: GnssStatus.Callback? = null

  override fun definition() = ModuleDefinition {
    Name("RamupinGps")

    /**
     * 위성 상태 구독 시작. 위치 권한이 있어야 합니다.
     * 이미 구독 중이면 아무것도 하지 않습니다.
     */
    Function("startSatelliteUpdates") {
      if (callback != null) return@Function true
      if (!hasLocationPermission()) return@Function false

      val cb = object : GnssStatus.Callback() {
        override fun onSatelliteStatusChanged(status: GnssStatus) {
          lastSatellites = summarize(status)
        }
      }
      // 메인 스레드 핸들러가 없으면 현재 스레드를 씁니다
      val registered = locationManager.registerGnssStatusCallback(cb, Handler(context.mainLooper))
      if (registered) callback = cb
      registered
    }

    Function("stopSatelliteUpdates") {
      callback?.let { locationManager.unregisterGnssStatusCallback(it) }
      callback = null
      lastSatellites = null
    }

    /**
     * 마지막 위성 상태. 아직 한 번도 못 받았으면 null.
     * 실내에서는 위성이 잡히지 않아 satellitesUsed 가 0 일 수 있습니다.
     */
    Function("getSatellites") {
      lastSatellites?.let {
        mapOf(
          "satellitesVisible" to it.visible,
          "satellitesUsed" to it.used,
          // 실제로 위치 계산에 쓰인 위성들의 평균 신호 세기 (dB-Hz). 30 이상이면 좋은 편
          "signalStrength" to it.averageCn0,
        )
      }
    }

    /** 지금 켜져 있는 위치 제공자 (gps / network / passive) */
    Function("getEnabledProviders") {
      mapOf(
        "gps" to locationManager.isProviderEnabled(LocationManager.GPS_PROVIDER),
        "network" to locationManager.isProviderEnabled(LocationManager.NETWORK_PROVIDER),
      )
    }

    /** 신체 활동 인식 권한이 있는지 (걷기·차량 판별에 필요, WBS 2.3) */
    Function("hasActivityPermission") {
      hasActivityPermission()
    }

    /**
     * 활동 인식 구독 시작 (WBS 2.3, 8.6).
     * @param intervalMs 이 시간마다 결과를 받습니다. 짧을수록 배터리를 더 씁니다
     *
     * 위치만으로는 실내에서 쓰러져 있는 것과 가만히 앉아 있는 것을 구분할 수 없습니다.
     * 이 값이 있으면 "걷고 있다 / 차 안이다 / 전혀 안 움직인다"를 알 수 있습니다.
     */
    AsyncFunction("startActivityUpdates") { intervalMs: Long ->
      if (!hasActivityPermission()) return@AsyncFunction false
      ActivityRecognition.getClient(context).requestActivityUpdates(intervalMs, activityIntent())
      true
    }

    AsyncFunction("stopActivityUpdates") {
      ActivityRecognition.getClient(context).removeActivityUpdates(activityIntent())
      true
    }

    /** 마지막으로 감지한 활동. 아직 못 받았으면 null */
    Function("getActivity") {
      val prefs = context.getSharedPreferences(ActivityReceiver.PREFS, Context.MODE_PRIVATE)
      val type = prefs.getString(ActivityReceiver.KEY_TYPE, null)
      type?.let {
        mapOf(
          "type" to it,
          // 0~100. 낮으면 안드로이드도 확신하지 못한다는 뜻이라 그대로 믿으면 안 됩니다
          "confidence" to prefs.getInt(ActivityReceiver.KEY_CONFIDENCE, 0),
          "detectedAt" to prefs.getLong(ActivityReceiver.KEY_AT, 0L),
        )
      }
    }

    OnDestroy {
      callback?.let { locationManager.unregisterGnssStatusCallback(it) }
      callback = null
    }
  }

  private fun hasActivityPermission() =
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) true
    else context.checkSelfPermission(Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

  /**
   * 결과를 받을 곳. 안드로이드가 여기에 결과를 담아 보냅니다.
   * FLAG_MUTABLE 이어야 합니다 — 시스템이 이 Intent 에 결과를 채워 넣기 때문입니다.
   */
  private fun activityIntent(): PendingIntent {
    val intent = Intent(context, ActivityReceiver::class.java)
    val flags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0)
    return PendingIntent.getBroadcast(context, ACTIVITY_REQUEST_CODE, intent, flags)
  }

  // androidx 의존성을 더하지 않으려고 표준 API 를 씁니다 (minSdk 24 이상이면 사용 가능)
  private fun hasLocationPermission() =
    context.checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) ==
      PackageManager.PERMISSION_GRANTED

  private companion object {
    const val ACTIVITY_REQUEST_CODE = 1001
  }

  private data class SatelliteInfo(val visible: Int, val used: Int, val averageCn0: Float?)

  private fun summarize(status: GnssStatus): SatelliteInfo {
    var used = 0
    var cn0Sum = 0f
    for (i in 0 until status.satelliteCount) {
      if (status.usedInFix(i)) {
        used += 1
        cn0Sum += status.getCn0DbHz(i)
      }
    }
    return SatelliteInfo(
      visible = status.satelliteCount,
      used = used,
      averageCn0 = if (used > 0) cn0Sum / used else null,
    )
  }
}
