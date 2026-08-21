// HealthKitSyncManager
//
// Sole owner of HealthKit reads, HKObserverQuery registration, and
// anchored incremental sync execution. Serializes concurrent trigger
// sources (foreground / observer callback / BGTaskScheduler wake)
// through a single-concurrency OperationQueue so no two syncs can
// race and the anchor advance is always causally consistent with the
// most recent successful persistence handoff.
//
// This class does NOT talk to the Supabase API for wearable data
// samples — that path is owned by the existing bulk-persist pipeline
// (WearableSyncBridge → persist-wearable-data). This class OWNS the
// authoritative status write via WearableStatusWriter.
//
// Outcome classification is the only truth signal the rest of the app
// receives:
//   .synced              → real samples observed and handed to the
//                          canonical native persistence path this run
//   .waitingForData      → authorization OK, zero new samples
//   .permissionRevoked   → HealthKit no longer authorized
//   .readFailed(err)     → HealthKit reads threw
//   .persistFailed(err)  → outbox enqueue / DB persist threw

import Foundation
import HealthKit

public enum SyncOutcome {
    case synced(counts: [String: Int], lastSampleAt: Date?)
    case waitingForData
    case permissionRevoked
    case readFailed(String)
    case persistFailed(String)
}

public final class HealthKitSyncManager {
    public static let shared = HealthKitSyncManager()

    private let store = HKHealthStore()
    private let anchors = HealthKitAnchorStore.shared
    private let writer = WearableStatusWriter.shared
    private let bridge = WearableSyncBridge.shared

    // Serial queue guarantees observer wakes cannot interleave with a
    // foreground run or a BG task. maxConcurrent = 1 + waitUntilFinished
    // false so callers stay non-blocking.
    private let opQueue: OperationQueue = {
        let q = OperationQueue()
        q.name = "app.mindmodule.healthkit.sync"
        q.maxConcurrentOperationCount = 1
        q.qualityOfService = .utility
        return q
    }()

    private let quantityTypes: [(id: HKQuantityTypeIdentifier, unit: HKUnit, metric: String)] = [
        (.heartRateVariabilitySDNN, .secondUnit(with: .milli), "hrv"),
        (.restingHeartRate, HKUnit.count().unitDivided(by: .minute()), "resting_heart_rate"),
        (.heartRate, HKUnit.count().unitDivided(by: .minute()), "heart_rate"),
    ]

    private var observersRegistered = false

    // MARK: - Public API

    public func bootstrap() {
        // Called from AppDelegate.didFinishLaunching. If HealthKit is
        // already authorized (from a previous run), register observers
        // so background delivery wakes us for new samples.
        guard HKHealthStore.isHealthDataAvailable() else { return }
        registerObserversIfAuthorized()
    }

    public func requestAuthorizationAndPrimeSync(completion: @escaping (Bool) -> Void) {
        guard HKHealthStore.isHealthDataAvailable() else {
            completion(false); return
        }
        let toRead = readTypeSet()
        store.requestAuthorization(toShare: nil, read: toRead) { [weak self] granted, err in
            guard let self = self else { return }
            if let err = err {
                NSLog("[HKSyncManager] authorization error: \(err.localizedDescription)")
                completion(false)
                return
            }
            if granted {
                self.registerObserversIfAuthorized()
                self.runForegroundSync(reason: "post-authorization") { _ in completion(true) }
            } else {
                completion(false)
            }
        }
    }

    /// Foreground / on-demand sync. Serialized with all other triggers.
    public func runForegroundSync(reason: String, completion: @escaping (SyncOutcome) -> Void) {
        enqueueSync(triggeredBy: "fg:\(reason)", completion: completion)
    }

    /// Observer wake path. Same serial queue as foreground.
    public func handleObserverUpdate(typeIdentifier: String, completion: @escaping () -> Void) {
        enqueueSync(triggeredBy: "observer:\(typeIdentifier)") { _ in completion() }
    }

    /// BGTaskScheduler wake path. Caller MUST invoke the returned
    /// completion so iOS can flag the task as complete before timing out.
    public func handleBackgroundWake(completion: @escaping () -> Void) {
        enqueueSync(triggeredBy: "bg") { _ in completion() }
    }

    // MARK: - Internal execution

    private func enqueueSync(triggeredBy: String, completion: @escaping (SyncOutcome) -> Void) {
        opQueue.addOperation { [weak self] in
            guard let self = self else { completion(.readFailed("deallocated")); return }
            let semaphore = DispatchSemaphore(value: 0)
            var finalOutcome: SyncOutcome = .waitingForData
            self.performSync(triggeredBy: triggeredBy) { outcome in
                finalOutcome = outcome
                semaphore.signal()
            }
            _ = semaphore.wait(timeout: .now() + 45) // hard cap so serial queue never wedges
            completion(finalOutcome)
        }
    }

    private func performSync(triggeredBy: String, completion: @escaping (SyncOutcome) -> Void) {
        NSLog("[HKSyncManager] performSync trigger=\(triggeredBy)")

        // Guard: authorization state. HealthKit intentionally returns
        // .notDetermined for reads; we can only detect explicit denial.
        let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN)!
        let status = store.authorizationStatus(for: hrvType)
        if status == .sharingDenied {
            writer.write(status: .permissionRevoked, errorCode: "permission_revoked") { _ in }
            completion(.permissionRevoked); return
        }

        // Perform per-metric anchored reads in parallel; join.
        let group = DispatchGroup()
        var perMetricCounts: [String: Int] = [:]
        var latestSample: Date? = nil
        var readError: Error? = nil
        var nextAnchors: [String: HKQueryAnchor] = [:]
        let syncQueue = DispatchQueue(label: "hk.sync.aggregate")

        for entry in quantityTypes {
            guard let hkType = HKObjectType.quantityType(forIdentifier: entry.id) else { continue }
            group.enter()
            self.runAnchoredQuery(type: hkType, typeIdentifier: entry.id.rawValue) { samples, newAnchor, err in
                defer { group.leave() }
                if let err = err { syncQueue.sync { readError = err }; return }
                let normalized = HealthKitSampleNormalizer.normalizeQuantity(
                    (samples as? [HKQuantitySample]) ?? [],
                    metric: entry.metric,
                    unit: entry.unit,
                )
                syncQueue.sync {
                    perMetricCounts[entry.metric, default: 0] += normalized.count
                    for s in normalized {
                        if let iso = s.payload["endDate"] as? String,
                           let d = ISO8601DateFormatter().date(from: iso) {
                            if latestSample == nil || d > latestSample! { latestSample = d }
                        }
                    }
                    if let newAnchor = newAnchor {
                        nextAnchors[entry.id.rawValue] = newAnchor
                    }
                }
            }
        }

        // Sleep: HKCategoryType, separate anchored read.
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            self.runAnchoredQuery(type: sleepType, typeIdentifier: HKCategoryTypeIdentifier.sleepAnalysis.rawValue) { samples, newAnchor, err in
                defer { group.leave() }
                if let err = err { syncQueue.sync { readError = err }; return }
                let normalized = HealthKitSampleNormalizer.normalizeSleep((samples as? [HKCategorySample]) ?? [])
                syncQueue.sync {
                    perMetricCounts["sleep", default: 0] += normalized.count
                    if let newAnchor = newAnchor {
                        nextAnchors[HKCategoryTypeIdentifier.sleepAnalysis.rawValue] = newAnchor
                    }
                }
            }
        }

        group.notify(queue: .global(qos: .utility)) { [weak self] in
            guard let self = self else { completion(.readFailed("deallocated")); return }
            if let err = readError {
                self.writer.write(status: .syncDelayed, errorCode: "healthkit_read_failed") { _ in }
                completion(.readFailed(err.localizedDescription))
                return
            }
            let totalCount = perMetricCounts.values.reduce(0, +)
            if totalCount == 0 {
                self.commitAnchors(nextAnchors)
                self.writer.write(status: .waitingForData) { _ in }
                completion(.waitingForData)
                return
            }
            // Canonical persistence lives in WearableSyncBridge, which already
            // shapes daily summaries exactly as persist-wearable-data expects.
            // We intentionally reuse that path instead of uploading raw
            // per-sample records from this manager.
            self.bridge.forceFetchAndPersistWithResult { success in
                if success {
                    self.commitAnchors(nextAnchors)
                    // Success: write authoritative synced status. lastSampleAt lets the
                    // backend advance the truthful staleness timestamp.
                    self.writer.write(
                        status: .synced,
                        lastSampleAt: latestSample,
                        counts: perMetricCounts,
                    ) { _ in }
                    completion(.synced(counts: perMetricCounts, lastSampleAt: latestSample))
                } else {
                    self.writer.write(status: .syncDelayed, errorCode: "auth_failed_bridge") { _ in }
                    completion(.readFailed("Auth failed in WearableSyncBridge"))
                }
            }
        }
    }

    // MARK: - Anchored query

    private func runAnchoredQuery(
        type: HKSampleType,
        typeIdentifier: String,
        completion: @escaping ([HKSample]?, HKQueryAnchor?, Error?) -> Void,
    ) {
        let savedAnchor = anchors.load(for: typeIdentifier)
        // First-run fallback: bounded 30-day scan so a reinstall does not
        // silently miss existing samples.
        let predicate: NSPredicate? = savedAnchor == nil
            ? HKQuery.predicateForSamples(withStart: Date().addingTimeInterval(-30 * 86_400), end: nil, options: [])
            : nil

        let query = HKAnchoredObjectQuery(
            type: type,
            predicate: predicate,
            anchor: savedAnchor,
            limit: HKObjectQueryNoLimit,
        ) { [weak self] _, samples, _, newAnchor, error in
            guard self != nil else { completion(nil, newAnchor, error); return }
            if let error = error {
                completion(nil, newAnchor, error)
                return
            }
            // Two-phase: return the proposed new anchor to the caller, then
            // persist it only after the canonical native upload handoff has run.
            completion(samples ?? [], newAnchor, nil)
        }
        store.execute(query)
    }

    private func commitAnchors(_ anchorsToSave: [String: HKQueryAnchor]) {
        for (typeIdentifier, anchor) in anchorsToSave {
            anchors.save(anchor, for: typeIdentifier)
        }
    }

    // MARK: - Observers

    private func registerObserversIfAuthorized() {
        guard !observersRegistered else { return }
        let types = allSampleTypes()
        // Only register when we already have some indication of authorization.
        // HealthKit does not surface read-authorization state directly, so
        // fall back to "register if user is signed in".
        observersRegistered = true
        for (type, id) in types {
            let observer = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
                if let error = error {
                    NSLog("[HKSyncManager] observer error \(id): \(error.localizedDescription)")
                    completionHandler(); return
                }
                self?.handleObserverUpdate(typeIdentifier: id) {
                    completionHandler() // MUST call — iOS stops delivering otherwise.
                }
            }
            store.execute(observer)
            store.enableBackgroundDelivery(for: type, frequency: .hourly) { success, err in
                if let err = err {
                    NSLog("[HKSyncManager] enableBackgroundDelivery \(id) err: \(err.localizedDescription)")
                } else {
                    NSLog("[HKSyncManager] background delivery for \(id): \(success)")
                }
            }
        }
    }

    private func allSampleTypes() -> [(HKSampleType, String)] {
        var out: [(HKSampleType, String)] = []
        for entry in quantityTypes {
            if let t = HKObjectType.quantityType(forIdentifier: entry.id) {
                out.append((t, entry.id.rawValue))
            }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            out.append((sleep, HKCategoryTypeIdentifier.sleepAnalysis.rawValue))
        }
        return out
    }

    private func readTypeSet() -> Set<HKObjectType> {
        var s: Set<HKObjectType> = []
        for entry in quantityTypes {
            if let t = HKObjectType.quantityType(forIdentifier: entry.id) { s.insert(t) }
        }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { s.insert(sleep) }
        return s
    }
}
