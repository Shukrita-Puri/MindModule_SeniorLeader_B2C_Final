package com.moonshot.mindmoduleapp.plugins.backgroundsync

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.moonshot.mindmoduleapp.sync.NativeOutbox

@CapacitorPlugin(name = "NativeBackgroundSync")
class NativeBackgroundSyncPlugin : Plugin() {

    @PluginMethod
    fun updateAuthToken(call: PluginCall) {
        val token = call.getString("token")
        // TODO: Store token in EncryptedSharedPreferences for WorkManager to use
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun clearAuthToken(call: PluginCall) {
        // TODO: Clear token from EncryptedSharedPreferences
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun runNow(call: PluginCall) {
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun forceHealthSync(call: PluginCall) {
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun forceCalendarSync(call: PluginCall) {
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun getDiagnostics(call: PluginCall) {
        val ret = JSObject()
        call.resolve(ret)
    }

    @PluginMethod
    fun getPendingOutboxItems(call: PluginCall) {
        val outbox = NativeOutbox.getInstance(context)
        val items = outbox.getPendingItems(NativeOutbox.Provider.HEALTH_CONNECT)
        
        val jsItems = com.getcapacitor.JSArray()
        items.forEach { 
            val jsItem = JSObject()
            jsItem.put("id", it.id)
            jsItem.put("provider", it.provider.value)
            jsItem.put("createdAt", it.createdAt)
            jsItems.put(jsItem)
        }
        
        val map = JSObject()
        map.put("health-connect", jsItems)
        
        val ret = JSObject()
        ret.put("items", map)
        call.resolve(ret)
    }

    @PluginMethod
    fun flushOutbox(call: PluginCall) {
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun clearOutbox(call: PluginCall) {
        val providerStr = call.getString("provider")
        val outbox = NativeOutbox.getInstance(context)
        if (providerStr == "apple-health" || providerStr == "health-connect") {
            outbox.clear(NativeOutbox.Provider.HEALTH_CONNECT)
        }
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun retryFailedItems(call: PluginCall) {
        val ret = JSObject()
        ret.put("success", true)
        call.resolve(ret)
    }
}
