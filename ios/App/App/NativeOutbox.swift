//
//  NativeOutbox.swift
//  Mind Module
//
//  Durable native outbox for background sync payloads (Apple Health + Apple Calendar).
//
//  Design:
//    - File-based JSON persistence in Application Support / mindmodule / outbox / <provider>.json
//      (Application Support survives backgrounding, app kill, OS restarts; excluded from iCloud backup.)
//    - Each provider has its own queue file.
//    - Hard cap of `maxItemsPerProvider` items per provider — oldest dropped on overflow (telemetry'd).
//    - Items are enqueued BEFORE upload is attempted, so a process kill mid-upload never loses data.
//    - On successful upload the item is removed; on failure retryCount/lastError are bumped and the
//      item stays in the file for the next launch / resume / observer fire / background fetch.
//
//  Threading: all reads/writes are serialised on a private dispatch queue.
//

import Foundation

@objc public class NativeOutbox: NSObject {

    public static let shared = NativeOutbox()

    public enum Provider: String, CaseIterable {
        case appleHealth = "apple-health"
        case appleCalendar = "apple-calendar"
    }

    public struct Item {
        public let id: String
        public let provider: Provider
        public let payload: [String: Any]
        public let createdAt: Double            // unix seconds
        public var lastAttemptAt: Double?       // unix seconds
        public var retryCount: Int
        public var lastError: String?

        public func toJSON() -> [String: Any] {
            var json: [String: Any] = [
                "id": id,
                "provider": provider.rawValue,
                "payload": payload,
                "createdAt": createdAt,
                "retryCount": retryCount,
            ]
            if let lastAttemptAt = lastAttemptAt { json["lastAttemptAt"] = lastAttemptAt }
            if let lastError = lastError { json["lastError"] = lastError }
            return json
        }

        public static func fromJSON(_ json: [String: Any]) -> Item? {
            guard let id = json["id"] as? String,
                  let providerRaw = json["provider"] as? String,
                  let provider = Provider(rawValue: providerRaw),
                  let payload = json["payload"] as? [String: Any],
                  let createdAt = (json["createdAt"] as? Double) ?? (json["createdAt"] as? NSNumber)?.doubleValue
            else { return nil }
            let retryCount = (json["retryCount"] as? Int) ?? 0
            let lastAttemptAt = json["lastAttemptAt"] as? Double
            let lastError = json["lastError"] as? String
            return Item(
                id: id,
                provider: provider,
                payload: payload,
                createdAt: createdAt,
                lastAttemptAt: lastAttemptAt,
                retryCount: retryCount,
                lastError: lastError
            )
        }
    }

    public let maxItemsPerProvider = 50

    private let queue = DispatchQueue(label: "mindmodule.nativeOutbox.io")
    private let fm = FileManager.default

    // MARK: - File paths

    private func outboxDir() -> URL? {
        guard let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask).first else { return nil }
        let dir = base.appendingPathComponent("mindmodule/outbox", isDirectory: true)
        if !fm.fileExists(atPath: dir.path) {
            // Protected-until-first-user-authentication so the file is encrypted at rest
            // BUT remains accessible to background processes after the user has unlocked
            // the device once since boot — which is required for HKObserverQuery /
            // background fetch to be able to read & write the outbox.
            let attrs: [FileAttributeKey: Any] = [
                .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
            ]
            try? fm.createDirectory(at: dir, withIntermediateDirectories: true, attributes: attrs)
            // Exclude from iCloud backup — these are local-only retry payloads.
            var u = dir
            var rv = URLResourceValues()
            rv.isExcludedFromBackup = true
            try? u.setResourceValues(rv)
        } else {
            // Re-apply protection class on existing dir (idempotent).
            try? fm.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: dir.path
            )
        }
        return dir
    }

    private func fileURL(for provider: Provider) -> URL? {
        return outboxDir()?.appendingPathComponent("\(provider.rawValue).json")
    }

    // MARK: - Read / write

    private func readItemsLocked(_ provider: Provider) -> [Item] {
        guard let url = fileURL(for: provider), fm.fileExists(atPath: url.path) else { return [] }
        guard let data = try? Data(contentsOf: url),
              let arr = try? JSONSerialization.jsonObject(with: data) as? [[String: Any]]
        else { return [] }
        return arr.compactMap { Item.fromJSON($0) }
    }

    private func writeItemsLocked(_ items: [Item], provider: Provider) {
        guard let url = fileURL(for: provider) else { return }
        let arr = items.map { $0.toJSON() }
        if let data = try? JSONSerialization.data(withJSONObject: arr, options: []) {
            // .atomic = write to temp + rename → no partial-write corruption risk.
            // .completeFileProtectionUntilFirstUserAuthentication = encrypted at rest,
            // accessible to background tasks after first unlock since boot.
            try? data.write(to: url, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            // Also stamp protection on the file (defensive — handles upgrade path).
            try? fm.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: url.path
            )
        }
    }

    // MARK: - Public API

    @discardableResult
    public func enqueue(provider: Provider, payload: [String: Any]) -> Item {
        var created: Item!
        queue.sync {
            var items = readItemsLocked(provider)
            let item = Item(
                id: UUID().uuidString,
                provider: provider,
                payload: payload,
                createdAt: Date().timeIntervalSince1970,
                lastAttemptAt: nil,
                retryCount: 0,
                lastError: nil
            )
            items.append(item)
            // Cap: drop oldest first (FIFO overflow).
            if items.count > maxItemsPerProvider {
                let drop = items.count - maxItemsPerProvider
                NSLog("[NativeOutbox] Overflow on \(provider.rawValue) — dropping \(drop) oldest item(s)")
                items.removeFirst(drop)
            }
            writeItemsLocked(items, provider: provider)
            created = item
        }
        NSLog("[NativeOutbox] Enqueued \(provider.rawValue) item \(created.id) (depth now: \(depth(provider: provider)))")
        return created
    }

    public func remove(id: String, provider: Provider) {
        queue.sync {
            var items = readItemsLocked(provider)
            let before = items.count
            items.removeAll { $0.id == id }
            if items.count != before {
                writeItemsLocked(items, provider: provider)
            }
        }
    }

    public func markFailure(id: String, provider: Provider, error: String) {
        queue.sync {
            var items = readItemsLocked(provider)
            if let idx = items.firstIndex(where: { $0.id == id }) {
                var it = items[idx]
                it.retryCount += 1
                it.lastAttemptAt = Date().timeIntervalSince1970
                it.lastError = String(error.prefix(500))
                items[idx] = it
                writeItemsLocked(items, provider: provider)
            }
        }
    }

    public func peek(provider: Provider) -> [Item] {
        var snap: [Item] = []
        queue.sync { snap = readItemsLocked(provider) }
        return snap
    }

    public func depth(provider: Provider) -> Int {
        var d = 0
        queue.sync { d = readItemsLocked(provider).count }
        return d
    }

    public func clear(provider: Provider? = nil) {
        queue.sync {
            let providers: [Provider] = provider.map { [$0] } ?? Provider.allCases
            for p in providers {
                if let url = fileURL(for: p) { try? fm.removeItem(at: url) }
            }
        }
    }

    public func snapshotAll() -> [String: [[String: Any]]] {
        var out: [String: [[String: Any]]] = [:]
        queue.sync {
            for p in Provider.allCases {
                out[p.rawValue] = readItemsLocked(p).map { $0.toJSON() }
            }
        }
        return out
    }
}

// MARK: - Diagnostics ledger (last observer / background timestamps)

@objc public class NativeSyncDiagnostics: NSObject {
    public static let shared = NativeSyncDiagnostics()

    private let defaults = UserDefaults.standard
    private let kLastHealthObserver = "mm.diag.lastHealthObserverAt"
    private let kLastHealthUpload = "mm.diag.lastHealthUploadAt"
    private let kLastCalendarBackground = "mm.diag.lastCalendarBackgroundAt"
    private let kLastCalendarUpload = "mm.diag.lastCalendarUploadAt"
    private let kLastBackgroundFetch = "mm.diag.lastBackgroundFetchAt"
    private let kLastUploadError = "mm.diag.lastUploadError"
    private let kAnchorShortCircuits = "mm.diag.anchorShortCircuits"
    private let kReconnectDrains = "mm.diag.reconnectDrains"
    private let kDedupHits = "mm.diag.dedupHits"
    private let kUploadLatencyMs = "mm.diag.lastUploadLatencyMs"
    private let kUploadSuccessCount = "mm.diag.uploadSuccessCount"
    private let kUploadFailureCount = "mm.diag.uploadFailureCount"

    public func recordHealthObserver() { defaults.set(Date().timeIntervalSince1970, forKey: kLastHealthObserver) }
    public func recordHealthUpload() { defaults.set(Date().timeIntervalSince1970, forKey: kLastHealthUpload) }
    public func recordCalendarBackground() { defaults.set(Date().timeIntervalSince1970, forKey: kLastCalendarBackground) }
    public func recordCalendarUpload() { defaults.set(Date().timeIntervalSince1970, forKey: kLastCalendarUpload) }
    public func recordBackgroundFetch() { defaults.set(Date().timeIntervalSince1970, forKey: kLastBackgroundFetch) }
    public func recordUploadError(_ message: String) {
        defaults.set(["at": Date().timeIntervalSince1970, "message": String(message.prefix(500))], forKey: kLastUploadError)
        defaults.set(defaults.integer(forKey: kUploadFailureCount) + 1, forKey: kUploadFailureCount)
    }
    public func recordAnchorShortCircuit() {
        defaults.set(defaults.integer(forKey: kAnchorShortCircuits) + 1, forKey: kAnchorShortCircuits)
    }
    public func recordReconnectDrain() {
        defaults.set(defaults.integer(forKey: kReconnectDrains) + 1, forKey: kReconnectDrains)
    }
    public func recordDedupHit() {
        defaults.set(defaults.integer(forKey: kDedupHits) + 1, forKey: kDedupHits)
    }
    public func recordUploadLatency(ms: Int) {
        defaults.set(ms, forKey: kUploadLatencyMs)
        defaults.set(defaults.integer(forKey: kUploadSuccessCount) + 1, forKey: kUploadSuccessCount)
    }

    public func snapshot() -> [String: Any] {
        return [
            "lastHealthObserverAt": defaults.object(forKey: kLastHealthObserver) ?? NSNull(),
            "lastHealthUploadAt": defaults.object(forKey: kLastHealthUpload) ?? NSNull(),
            "lastCalendarBackgroundAt": defaults.object(forKey: kLastCalendarBackground) ?? NSNull(),
            "lastCalendarUploadAt": defaults.object(forKey: kLastCalendarUpload) ?? NSNull(),
            "lastBackgroundFetchAt": defaults.object(forKey: kLastBackgroundFetch) ?? NSNull(),
            "lastUploadError": defaults.object(forKey: kLastUploadError) ?? NSNull(),
            "anchorShortCircuits": defaults.integer(forKey: kAnchorShortCircuits),
            "reconnectDrains": defaults.integer(forKey: kReconnectDrains),
            "dedupHits": defaults.integer(forKey: kDedupHits),
            "lastUploadLatencyMs": defaults.object(forKey: kUploadLatencyMs) ?? NSNull(),
            "uploadSuccessCount": defaults.integer(forKey: kUploadSuccessCount),
            "uploadFailureCount": defaults.integer(forKey: kUploadFailureCount),
        ]
    }
}