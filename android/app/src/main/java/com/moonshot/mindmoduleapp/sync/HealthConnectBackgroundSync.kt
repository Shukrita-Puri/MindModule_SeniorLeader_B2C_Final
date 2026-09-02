package com.moonshot.mindmoduleapp.sync

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.temporal.ChronoUnit

/**
 * Reads data from Android Health Connect and formats it for Supabase.
 * Equivalent to iOS HealthKitSyncManager.swift.
 */
class HealthConnectBackgroundSync(private val context: Context) {

    suspend fun syncLast24Hours(): Boolean {
        if (!HealthConnectClient.getSdkStatus(context, "com.google.android.apps.healthdata") 
            .equals(HealthConnectClient.SDK_AVAILABLE)) {
            return false
        }

        val healthConnectClient = HealthConnectClient.getOrCreate(context)
        val endTime = Instant.now()
        val startTime = endTime.minus(24, ChronoUnit.HOURS)

        val timeRangeFilter = TimeRangeFilter.between(startTime, endTime)

        try {
            val hrvResponse = healthConnectClient.readRecords(
                ReadRecordsRequest(
                    recordType = HeartRateVariabilityRmssdRecord::class,
                    timeRangeFilter = timeRangeFilter
                )
            )

            val sleepResponse = healthConnectClient.readRecords(
                ReadRecordsRequest(
                    recordType = SleepSessionRecord::class,
                    timeRangeFilter = timeRangeFilter
                )
            )

            // Format payload to match iOS HealthKitSampleNormalizer
            val payload = JSONObject()
            val samples = JSONArray()
            
            hrvResponse.records.forEach { record ->
                val sample = JSONObject()
                sample.put("type", "heartRateVariabilitySDNN")
                sample.put("value", record.rmssd)
                sample.put("startDate", record.time.toString())
                sample.put("endDate", record.time.toString())
                sample.put("source", record.metadata.dataOrigin.packageName)
                samples.put(sample)
            }
            
            // TODO: Append Sleep, HR, RHR to samples array
            payload.put("samples", samples)

            // Push to native outbox
            if (samples.length() > 0) {
                val outbox = NativeOutbox.getInstance(context)
                outbox.enqueue(NativeOutbox.Provider.HEALTH_CONNECT, payload)
            }
            
            return true
        } catch (e: Exception) {
            e.printStackTrace()
            return false
        }
    }
}
