package com.moonshot.mindmoduleapp.sync

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.UUID

/**
 * Durable native outbox for background sync payloads (Android Health Connect).
 *
 * Design:
 *   - File-based JSON persistence in app's internal files directory (survives backgrounding, app kill).
 *   - Each provider has its own queue file.
 *   - Hard cap of items per provider — oldest dropped on overflow.
 *   - Serialized access.
 */
class NativeOutbox private constructor(private val context: Context) {

    enum class Provider(val value: String) {
        HEALTH_CONNECT("health-connect");

        companion object {
            fun fromValue(value: String): Provider? = values().find { it.value == value }
        }
    }

    data class Item(
        val id: String,
        val provider: Provider,
        val payload: JSONObject,
        val createdAt: Long,
        var lastAttemptAt: Long? = null,
        var retryCount: Int = 0,
        var lastError: String? = null
    ) {
        fun toJson(): JSONObject {
            val json = JSONObject()
            json.put("id", id)
            json.put("provider", provider.value)
            json.put("payload", payload)
            json.put("createdAt", createdAt)
            json.put("retryCount", retryCount)
            lastAttemptAt?.let { json.put("lastAttemptAt", it) }
            lastError?.let { json.put("lastError", it) }
            return json
        }

        companion object {
            fun fromJson(json: JSONObject): Item? {
                val id = json.optString("id")
                val providerRaw = json.optString("provider")
                val provider = Provider.fromValue(providerRaw)
                val payload = json.optJSONObject("payload")
                val createdAt = json.optLong("createdAt", -1L)
                
                if (id.isEmpty() || provider == null || payload == null || createdAt == -1L) {
                    return null
                }
                
                return Item(
                    id = id,
                    provider = provider,
                    payload = payload,
                    createdAt = createdAt,
                    lastAttemptAt = if (json.has("lastAttemptAt")) json.getLong("lastAttemptAt") else null,
                    retryCount = json.optInt("retryCount", 0),
                    lastError = json.optString("lastError", null)
                )
            }
        }
    }

    private val MAX_ITEMS_PER_PROVIDER = 100
    private val lock = Any()

    companion object {
        @Volatile
        private var instance: NativeOutbox? = null

        fun getInstance(context: Context): NativeOutbox {
            return instance ?: synchronized(this) {
                instance ?: NativeOutbox(context.applicationContext).also { instance = it }
            }
        }
    }

    private fun getOutboxDirectory(): File {
        val dir = File(context.filesDir, "outbox")
        if (!dir.exists()) {
            dir.mkdirs()
        }
        return dir
    }

    private fun getFileForProvider(provider: Provider): File {
        return File(getOutboxDirectory(), "${provider.value}.json")
    }

    private fun readItems(provider: Provider): MutableList<Item> {
        val file = getFileForProvider(provider)
        if (!file.exists()) return mutableListOf()
        
        try {
            val jsonText = file.readText()
            val jsonArray = JSONArray(jsonText)
            val items = mutableListOf<Item>()
            for (i in 0 until jsonArray.length()) {
                val itemObj = jsonArray.optJSONObject(i) ?: continue
                Item.fromJson(itemObj)?.let { items.add(it) }
            }
            return items
        } catch (e: Exception) {
            e.printStackTrace()
            return mutableListOf()
        }
    }

    private fun writeItems(provider: Provider, items: List<Item>) {
        val file = getFileForProvider(provider)
        try {
            val jsonArray = JSONArray()
            items.forEach { jsonArray.put(it.toJson()) }
            file.writeText(jsonArray.toString())
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    fun enqueue(provider: Provider, payload: JSONObject): Item {
        synchronized(lock) {
            var items = readItems(provider)
            val item = Item(
                id = UUID.randomUUID().toString(),
                provider = provider,
                payload = payload,
                createdAt = System.currentTimeMillis() / 1000L
            )
            items.add(item)
            
            // Enforce limit
            if (items.size > MAX_ITEMS_PER_PROVIDER) {
                // Drop oldest
                items = items.sortedBy { it.createdAt }.takeLast(MAX_ITEMS_PER_PROVIDER).toMutableList()
            }
            
            writeItems(provider, items)
            return item
        }
    }

    fun getPendingItems(provider: Provider): List<Item> {
        synchronized(lock) {
            return readItems(provider)
        }
    }

    fun removeItem(provider: Provider, id: String) {
        synchronized(lock) {
            val items = readItems(provider)
            val updated = items.filter { it.id != id }
            if (updated.size != items.size) {
                writeItems(provider, updated)
            }
        }
    }

    fun updateItem(provider: Provider, id: String, retryCount: Int, lastError: String?) {
        synchronized(lock) {
            val items = readItems(provider)
            val index = items.indexOfFirst { it.id == id }
            if (index != -1) {
                val item = items[index]
                item.retryCount = retryCount
                item.lastError = lastError
                item.lastAttemptAt = System.currentTimeMillis() / 1000L
                writeItems(provider, items)
            }
        }
    }
    
    fun clear(provider: Provider) {
        synchronized(lock) {
            val file = getFileForProvider(provider)
            if (file.exists()) {
                file.delete()
            }
        }
    }
}
