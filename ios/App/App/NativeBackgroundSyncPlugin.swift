//
//  NativeBackgroundSyncPlugin.swift
//  Mind Module
//
//  Stores the current Auth0 access token in Keychain for native background
//  sync jobs and exposes a QA/manual native sync trigger to JS.
//

import Foundation
import Capacitor
import Security

@objc(NativeBackgroundSyncPlugin)
public class NativeBackgroundSyncPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NativeBackgroundSyncPlugin"
    public let jsName = "NativeBackgroundSync"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "updateAuthToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearAuthToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "runNow", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forceHealthSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forceCalendarSync", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getDiagnostics", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPendingOutboxItems", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "flushOutbox", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearOutbox", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "retryFailedItems", returnType: CAPPluginReturnPromise),
    ]

    private let tokenKey = "mindmodule.auth0_token"
    private let tokenExpiryKey = "mindmodule.auth0_token_expires_at"

    @objc func updateAuthToken(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), !token.isEmpty else {
            call.reject("Missing token")
            return
        }

        let expiresAt = call.getDouble("expiresAt") ?? 0
        do {
            try saveKeychain(key: tokenKey, value: token)
            if expiresAt > 0 {
                try saveKeychain(key: tokenExpiryKey, value: String(Int(expiresAt)))
            }
            NSLog("[NativeBackgroundSync] Auth token stored for background sync")
            call.resolve(["success": true])
        } catch {
            call.reject("Failed to store background token: \(error.localizedDescription)")
        }
    }

    @objc func clearAuthToken(_ call: CAPPluginCall) {
        deleteKeychain(key: tokenKey)
        deleteKeychain(key: tokenExpiryKey)
        NSLog("[NativeBackgroundSync] Auth token cleared")
        call.resolve(["success": true])
    }

    @objc func runNow(_ call: CAPPluginCall) {
        let group = DispatchGroup()
        var wearableDone = false
        var calendarDone = false

        group.enter()
        WearableSyncBridge.shared.fetchAndPersist {
            wearableDone = true
            group.leave()
        }

        group.enter()
        AppleCalendarBackgroundSyncBridge.shared.fetchAndPersist {
            calendarDone = true
            group.leave()
        }

        group.notify(queue: .main) {
            call.resolve([
                "success": true,
                "wearableDone": wearableDone,
                "calendarDone": calendarDone,
            ])
        }
    }

    @objc func forceHealthSync(_ call: CAPPluginCall) {
        WearableSyncBridge.shared.forceFetchAndPersist {
            call.resolve(["success": true])
        }
    }

    @objc func forceCalendarSync(_ call: CAPPluginCall) {
        AppleCalendarBackgroundSyncBridge.shared.fetchAndPersist {
            call.resolve(["success": true])
        }
    }

    @objc func getDiagnostics(_ call: CAPPluginCall) {
        let depthHealth = NativeOutbox.shared.depth(provider: .appleHealth)
        let depthCalendar = NativeOutbox.shared.depth(provider: .appleCalendar)
        var diag = NativeSyncDiagnostics.shared.snapshot()
        diag["outboxDepth"] = [
            "apple-health": depthHealth,
            "apple-calendar": depthCalendar,
        ]
        diag["maxItemsPerProvider"] = NativeOutbox.shared.maxItemsPerProvider
        call.resolve(diag)
    }

    @objc func getPendingOutboxItems(_ call: CAPPluginCall) {
        call.resolve(["items": NativeOutbox.shared.snapshotAll()])
    }

    @objc func flushOutbox(_ call: CAPPluginCall) {
        let group = DispatchGroup()
        group.enter()
        WearableSyncBridge.shared.flushOutbox { group.leave() }
        group.enter()
        AppleCalendarBackgroundSyncBridge.shared.flushOutbox { group.leave() }
        group.notify(queue: .main) {
            call.resolve([
                "success": true,
                "remaining": [
                    "apple-health": NativeOutbox.shared.depth(provider: .appleHealth),
                    "apple-calendar": NativeOutbox.shared.depth(provider: .appleCalendar),
                ],
            ])
        }
    }

    @objc func clearOutbox(_ call: CAPPluginCall) {
        let providerStr = call.getString("provider")
        if let providerStr = providerStr,
           let p = NativeOutbox.Provider(rawValue: providerStr) {
            NativeOutbox.shared.clear(provider: p)
        } else {
            NativeOutbox.shared.clear()
        }
        call.resolve(["success": true])
    }

    @objc func retryFailedItems(_ call: CAPPluginCall) {
        // Same as flushOutbox — retains existing failures and reposts each item.
        flushOutbox(call)
    }

    private func saveKeychain(key: String, value: String) throws {
        let data = Data(value.utf8)
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        let attrs: [String: Any] = [
            kSecValueData as String: data,
            kSecAttrAccessible as String: kSecAttrAccessibleAfterFirstUnlock,
        ]

        let status = SecItemUpdate(query as CFDictionary, attrs as CFDictionary)
        if status == errSecItemNotFound {
            var addQuery = query
            attrs.forEach { addQuery[$0.key] = $0.value }
            let addStatus = SecItemAdd(addQuery as CFDictionary, nil)
            guard addStatus == errSecSuccess else {
                throw NSError(domain: NSOSStatusErrorDomain, code: Int(addStatus))
            }
            return
        }

        guard status == errSecSuccess else {
            throw NSError(domain: NSOSStatusErrorDomain, code: Int(status))
        }
    }

    private func deleteKeychain(key: String) {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
        ]
        SecItemDelete(query as CFDictionary)
    }
}
