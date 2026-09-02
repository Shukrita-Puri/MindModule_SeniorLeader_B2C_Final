package com.moonshot.mindmoduleapp.plugins.calendar

import android.Manifest
import android.content.pm.PackageManager
import android.provider.CalendarContract
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import java.util.Date

/**
 * Android implementation of the custom AppleCalendar plugin.
 * We use the same name ("AppleCalendar") so the JS layer doesn't need to change.
 */
@CapacitorPlugin(
    name = "AppleCalendar",
    permissions = [
        Permission(strings = [Manifest.permission.READ_CALENDAR], alias = "calendar")
    ]
)
class AndroidCalendarPlugin : Plugin() {

    @PluginMethod
    fun getPermissionStatus(call: PluginCall) {
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CALENDAR
        ) == PackageManager.PERMISSION_GRANTED
        
        val ret = JSObject()
        ret.put("status", if (hasPermission) "authorized" else "not_determined")
        call.resolve(ret)
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        // Uses Capacitor's built-in permission request flow
        requestPermissionForAlias("calendar", call, "permissionCallback")
    }

    @PluginMethod
    fun permissionCallback(call: PluginCall) {
        val hasPermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_CALENDAR
        ) == PackageManager.PERMISSION_GRANTED
        
        val ret = JSObject()
        ret.put("status", if (hasPermission) "authorized" else "denied")
        call.resolve(ret)
    }

    @PluginMethod
    fun fetchEvents(call: PluginCall) {
        val startDateMs = call.getDouble("startDate")?.toLong() ?: return call.reject("Missing startDate")
        val endDateMs = call.getDouble("endDate")?.toLong() ?: return call.reject("Missing endDate")

        if (ContextCompat.checkSelfPermission(context, Manifest.permission.READ_CALENDAR) != PackageManager.PERMISSION_GRANTED) {
            return call.reject("Calendar permission not granted")
        }

        val eventsArray = JSArray()
        val projection = arrayOf(
            CalendarContract.Events._ID,
            CalendarContract.Events.TITLE,
            CalendarContract.Events.DTSTART,
            CalendarContract.Events.DTEND,
            CalendarContract.Events.EVENT_LOCATION,
            CalendarContract.Events.DESCRIPTION,
            CalendarContract.Events.ALL_DAY
        )

        val selection = "${CalendarContract.Events.DTSTART} >= ? AND ${CalendarContract.Events.DTEND} <= ?"
        val selectionArgs = arrayOf(startDateMs.toString(), endDateMs.toString())

        try {
            val cursor = context.contentResolver.query(
                CalendarContract.Events.CONTENT_URI,
                projection,
                selection,
                selectionArgs,
                "${CalendarContract.Events.DTSTART} ASC"
            )

            cursor?.use {
                val idIdx = it.getColumnIndexOrThrow(CalendarContract.Events._ID)
                val titleIdx = it.getColumnIndexOrThrow(CalendarContract.Events.TITLE)
                val startIdx = it.getColumnIndexOrThrow(CalendarContract.Events.DTSTART)
                val endIdx = it.getColumnIndexOrThrow(CalendarContract.Events.DTEND)
                val locIdx = it.getColumnIndexOrThrow(CalendarContract.Events.EVENT_LOCATION)
                val descIdx = it.getColumnIndexOrThrow(CalendarContract.Events.DESCRIPTION)
                val allDayIdx = it.getColumnIndexOrThrow(CalendarContract.Events.ALL_DAY)

                while (it.moveToNext()) {
                    val eventObj = JSObject()
                    eventObj.put("external_id", it.getString(idIdx))
                    eventObj.put("title", it.getString(titleIdx) ?: "Untitled Event")
                    eventObj.put("startDate", it.getLong(startIdx))
                    eventObj.put("endDate", it.getLong(endIdx))
                    eventObj.put("location", it.getString(locIdx))
                    
                    val notes = it.getString(descIdx)
                    if (notes != null) {
                        eventObj.put("notes", notes.take(500))
                    }
                    
                    // Defaults to match iOS payload expectations
                    eventObj.put("is_organizer", false)
                    eventObj.put("attendees_count", 0)
                    eventObj.put("is_recurring", false)

                    eventsArray.put(eventObj)
                }
            }
            
            val ret = JSObject()
            ret.put("events", eventsArray)
            call.resolve(ret)
            
        } catch (e: Exception) {
            e.printStackTrace()
            call.reject("Failed to fetch events: ${e.message}")
        }
    }
}
