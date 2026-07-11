// HealthKitAnchorStore
//
// Persists HKQueryAnchor per HealthKit sample type so incremental
// HKAnchoredObjectQuery reads never re-emit already-processed samples
// across app restarts, background wakes, or foreground syncs.
//
// Anchors are stored in a dedicated UserDefaults suite (survives app
// restarts but is wiped on uninstall — the first post-reinstall sync
// intentionally falls back to a bounded 30-day scan). Anchors are
// only advanced by the caller AFTER the outbox has durably enqueued
// the payload; see HealthKitSyncManager two-phase persist.

import Foundation
import HealthKit

public final class HealthKitAnchorStore {
    public static let shared = HealthKitAnchorStore()

    private static let suiteName = "app.mindmodule.healthkit.anchors.v1"
    private static let keyPrefix = "hk.anchor.v1."

    private let defaults: UserDefaults

    public init(defaults: UserDefaults? = nil) {
        self.defaults = defaults ?? UserDefaults(suiteName: Self.suiteName) ?? .standard
    }

    // MARK: - Public API

    public func load(for typeIdentifier: String) -> HKQueryAnchor? {
        let key = Self.keyPrefix + typeIdentifier
        guard let data = defaults.data(forKey: key) else { return nil }
        do {
            return try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
        } catch {
            NSLog("[HKAnchorStore] failed to decode anchor for \(typeIdentifier): \(error)")
            // Corrupt anchor — drop it so next read falls back to bounded scan.
            defaults.removeObject(forKey: key)
            return nil
        }
    }

    public func save(_ anchor: HKQueryAnchor, for typeIdentifier: String) {
        let key = Self.keyPrefix + typeIdentifier
        do {
            let data = try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
            defaults.set(data, forKey: key)
        } catch {
            NSLog("[HKAnchorStore] failed to encode anchor for \(typeIdentifier): \(error)")
        }
    }

    /// Wipe all anchors — call on explicit disconnect or permission reset so a
    /// subsequent reconnect does a clean bounded backfill.
    public func clearAll() {
        for key in defaults.dictionaryRepresentation().keys where key.hasPrefix(Self.keyPrefix) {
            defaults.removeObject(forKey: key)
        }
    }
}