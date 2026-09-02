package com.moonshot.mindmoduleapp.plugins.location

import android.Manifest
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

@CapacitorPlugin(
    name = "LocationBridge",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_COARSE_LOCATION, Manifest.permission.ACCESS_FINE_LOCATION], alias = "location"),
        Permission(strings = [Manifest.permission.ACCESS_BACKGROUND_LOCATION], alias = "background_location")
    ]
)
class LocationBridgePlugin : Plugin() {

    @PluginMethod
    fun requestAlwaysAuthorization(call: PluginCall) {
        // TODO: Request background location permissions via Capacitor permission API
        call.resolve()
    }

    @PluginMethod
    fun requestOneShotLocation(call: PluginCall) {
        // TODO: Use FusedLocationProviderClient to get current location and send to Supabase
        call.resolve()
    }

    @PluginMethod
    fun startIfAuthorized(call: PluginCall) {
        // TODO: Start significant location changes monitoring
        call.resolve()
    }

    @PluginMethod
    fun currentAuthorizationString(call: PluginCall) {
        val hasForeground = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
        val hasBackground = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_BACKGROUND_LOCATION) == PackageManager.PERMISSION_GRANTED
        
        val status = when {
            hasBackground -> "authorized_always"
            hasForeground -> "authorized_when_in_use"
            else -> "not_determined"
        }
        
        val ret = JSObject()
        ret.put("value", status)
        call.resolve(ret)
    }
}
