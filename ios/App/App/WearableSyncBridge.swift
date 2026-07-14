//
//  WearableSyncBridge.swift
//  Mind Module
//
//  Native iOS background HealthKit sync.
//  - Registers HKObserverQueries for HRV, RHR, HR, Sleep at app launch.
//  - iOS wakes the app silently whenever new samples arrive.
//  - Pulls a 7-day window via HKAnchoredObjectQuery (incremental, anchor persisted).
//  - POSTs to the existing `persist-wearable-data` Supabase edge function.
//  - Auth token + anchor stored in iOS Keychain so JS layer + native layer share state.
//

import Foundation
import HealthKit
import Security

@objc public class WearableSyncBridge: NSObject {

    public static let shared = WearableSyncBridge()

    private let healthStore = HKHealthStore()
    private let supabaseProjectId = "iyilcpvercoywaweybpc"
    private var edgeFunctionURL: URL {
        return URL(string: "https://\(supabaseProjectId).supabase.co/functions/v1/persist-wearable-data")!
    }

    // Keychain keys
    private let kKeychainTokenKey = "mindmodule.auth0_token"
    private let kKeychainAnchorKey = "mindmodule.healthkit_anchor"

    // UserDefaults keys for per-type HKQueryAnchor (archived as Data).
    private func anchorDefaultsKey(for type: HKSampleType) -> String {
        return "mm.healthkit.anchor.\(type.identifier)"
    }

    private func loadAnchor(for type: HKSampleType) -> HKQueryAnchor? {
        guard let data = UserDefaults.standard.data(forKey: anchorDefaultsKey(for: type)) else { return nil }
        do {
            return try NSKeyedUnarchiver.unarchivedObject(ofClass: HKQueryAnchor.self, from: data)
        } catch {
            NSLog("[WearableSyncBridge] Anchor decode failed for \(type.identifier): \(error.localizedDescription) — resetting")
            UserDefaults.standard.removeObject(forKey: anchorDefaultsKey(for: type))
            return nil
        }
    }

    private func saveAnchor(_ anchor: HKQueryAnchor, for type: HKSampleType) {
        do {
            let data = try NSKeyedArchiver.archivedData(withRootObject: anchor, requiringSecureCoding: true)
            UserDefaults.standard.set(data, forKey: anchorDefaultsKey(for: type))
        } catch {
            NSLog("[WearableSyncBridge] Anchor save failed for \(type.identifier): \(error.localizedDescription)")
        }
    }

    /// Anchored "is there anything new since last fetch?" probe.
    /// Returns true when the observer fire actually corresponds to new sample data.
    /// Updates the per-type anchor on every successful query so the next probe
    /// only sees newer samples — incremental and battery-friendly.
    private func hasNewSamplesSinceAnchor(type: HKSampleType, completion: @escaping (Bool) -> Void) {
        let anchor = loadAnchor(for: type)
        let q = HKAnchoredObjectQuery(
            type: type,
            predicate: nil,
            anchor: anchor,
            limit: HKObjectQueryNoLimit
        ) { [weak self] _, samples, deleted, newAnchor, error in
            if let error = error {
                NSLog("[WearableSyncBridge] Anchored probe failed for \(type.identifier): \(error.localizedDescription)")
                // Fail-open: assume there might be new data so we don't lose syncs.
                completion(true)
                return
            }
            if let newAnchor = newAnchor { self?.saveAnchor(newAnchor, for: type) }
            let added = samples?.count ?? 0
            let removed = deleted?.count ?? 0
            completion((added + removed) > 0)
        }
        healthStore.execute(q)
    }

    /// Probes all observed types in parallel; calls completion(true) as soon as
    /// any type reports new data, otherwise false after all probes finish.
    private func anyNewSamples(completion: @escaping (Bool) -> Void) {
        let group = DispatchGroup()
        var anyNew = false
        let lock = NSLock()
        for t in observedTypes {
            group.enter()
            hasNewSamplesSinceAnchor(type: t) { isNew in
                lock.lock()
                if isNew { anyNew = true }
                lock.unlock()
                group.leave()
            }
        }
        group.notify(queue: .global(qos: .background)) {
            completion(anyNew)
        }
    }

    // Sample types we observe
    private var observedTypes: [HKSampleType] {
        var types: [HKSampleType] = []
        if let hrv = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) { types.append(hrv) }
        if let rhr = HKObjectType.quantityType(forIdentifier: .restingHeartRate) { types.append(rhr) }
        if let hr  = HKObjectType.quantityType(forIdentifier: .heartRate) { types.append(hr) }
        if let sleep = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) { types.append(sleep) }
        return types
    }

    // MARK: - Public entry point (called from AppDelegate.didFinishLaunching)

    @objc public func registerBackgroundObservers() {
        guard HKHealthStore.isHealthDataAvailable() else {
            NSLog("[WearableSyncBridge] HealthKit not available on this device")
            return
        }

        // We do NOT call requestAuthorization here — that's owned by the JS layer
        // via @capgo/capacitor-health. We just register observers on the types we care about.
        // If the user hasn't granted permission yet, the observer simply never fires — harmless.

        for type in observedTypes {
            registerObserver(for: type)
            // Prefer .immediate where iOS allows (HRV/HR/Sleep emit through the day);
            // iOS still coalesces these to roughly 30-min windows, giving us the
            // half-hourly preferred cadence without manual scheduling. RHR is only
            // emitted ~1x/day by Apple — keep it on .hourly to avoid useless wakes.
            let frequency: HKUpdateFrequency = (type.identifier == HKQuantityTypeIdentifier.restingHeartRate.rawValue)
                ? .hourly
                : .immediate
            healthStore.enableBackgroundDelivery(for: type, frequency: frequency) { success, error in
                if let error = error {
                    NSLog("[WearableSyncBridge] enableBackgroundDelivery error for \(type.identifier): \(error.localizedDescription)")
                } else {
                    NSLog("[WearableSyncBridge] Background delivery enabled for \(type.identifier) at \(frequency): \(success)")
                }
            }
        }
    }

    private func registerObserver(for type: HKSampleType) {
        let query = HKObserverQuery(sampleType: type, predicate: nil) { [weak self] _, completionHandler, error in
            guard let self = self else { completionHandler(); return }
            if let error = error {
                NSLog("[WearableSyncBridge] Observer error for \(type.identifier): \(error.localizedDescription)")
                completionHandler()
                return
            }
            NSLog("[WearableSyncBridge] Observer fired for \(type.identifier)")
            NativeSyncDiagnostics.shared.recordHealthObserver()
            self.fetchAndPersist {
                completionHandler()
            }
        }
        healthStore.execute(query)
    }

    // MARK: - Fetch + Persist

    /// Reads HRV/RHR/HR/Sleep for the past 7 days and POSTs to the edge function.
    /// Designed for background execution — must call `done()` when finished.
    public func fetchAndPersist(done: @escaping () -> Void) {
        guard let token = readKeychain(key: kKeychainTokenKey), !token.isEmpty else {
            NSLog("[WearableSyncBridge] No auth token in Keychain — skipping sync")
            done()
            return
        }

        // Anchored short-circuit: ask HealthKit "are there ANY new samples since
        // last successful read?". If not, skip the heavy 7-day aggregation +
        // upload entirely and just drain any pending outbox items. This is the
        // single biggest battery / network reduction for noisy observer fires.
        anyNewSamples { [weak self] anyNew in
            guard let self = self else { done(); return }
            if !anyNew {
                NSLog("[WearableSyncBridge] Anchored probe — no new samples; draining outbox only")
                NativeSyncDiagnostics.shared.recordAnchorShortCircuit()
                self.drainOutbox(token: token, done: done)
                return
            }
            self.fetchAndPersistFull(token: token, done: done)
        }
    }

    /// Foreground/manual fallback used when the JS HealthKit plugin reports
    /// zero samples. This bypasses HKQueryAnchor short-circuiting so a newly
    /// granted device can backfill the last 7 days even if observer anchors
    /// were initialized before Health permissions or watch data were ready.
    @objc public func forceFetchAndPersist(done: @escaping () -> Void) {
        guard let token = readKeychain(key: kKeychainTokenKey), !token.isEmpty else {
            NSLog("[WearableSyncBridge] forceFetchAndPersist: no auth token — skipping")
            done()
            return
        }
        NSLog("[WearableSyncBridge] forceFetchAndPersist: bypassing anchor probe")
        fetchAndPersistFull(token: token, done: done)
    }

    private func fetchAndPersistFull(token: String, done: @escaping () -> Void) {
        let endDate = Date()
        let startDate = Calendar.current.date(byAdding: .day, value: -7, to: endDate) ?? endDate

        let group = DispatchGroup()
        // dayKey -> partial sample
        var dailySamples: [String: [String: Any]] = [:]
        // dayKey -> { metric -> Set<bundleId> }
        var sourcesPerDay: [String: [String: Set<String>]] = [:]
        let lock = NSLock()

        // Track the most recent Oura-sourced sample we observed across this run
        // for diagnostics + UI ("last Oura sample seen via Apple Health").
        var latestOuraSampleAt: Date? = nil

        func mergeSources(day: String, metric: String, bundles: [String]) {
            var byMetric = sourcesPerDay[day] ?? [:]
            var set = byMetric[metric] ?? Set<String>()
            for b in bundles where !b.isEmpty { set.insert(b) }
            byMetric[metric] = set
            sourcesPerDay[day] = byMetric
        }

        // ----- HRV -----
        if let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            group.enter()
            queryQuantityDaily(type: hrvType, unit: HKUnit.secondUnit(with: .milli), start: startDate, end: endDate) { dayMap, sourceMap, latestOura in
                lock.lock()
                for (day, value) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    entry["hrv"] = value
                    dailySamples[day] = entry
                }
                for (day, bundles) in sourceMap { mergeSources(day: day, metric: "hrv", bundles: bundles) }
                if let t = latestOura, latestOuraSampleAt == nil || t > (latestOuraSampleAt ?? .distantPast) { latestOuraSampleAt = t }
                lock.unlock()
                group.leave()
            }
        }

        // ----- RHR -----
        if let rhrType = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            group.enter()
            queryQuantityDaily(type: rhrType, unit: HKUnit(from: "count/min"), start: startDate, end: endDate) { dayMap, sourceMap, latestOura in
                lock.lock()
                for (day, value) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    entry["resting_heart_rate"] = Int(round(value))
                    dailySamples[day] = entry
                }
                for (day, bundles) in sourceMap { mergeSources(day: day, metric: "resting_heart_rate", bundles: bundles) }
                if let t = latestOura, latestOuraSampleAt == nil || t > (latestOuraSampleAt ?? .distantPast) { latestOuraSampleAt = t }
                lock.unlock()
                group.leave()
            }
        }

        // ----- HR (avg) -----
        if let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            group.enter()
            queryQuantityDaily(type: hrType, unit: HKUnit(from: "count/min"), start: startDate, end: endDate) { dayMap, sourceMap, latestOura in
                lock.lock()
                for (day, value) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    entry["heart_rate"] = Int(round(value))
                    dailySamples[day] = entry
                }
                for (day, bundles) in sourceMap { mergeSources(day: day, metric: "heart_rate", bundles: bundles) }
                if let t = latestOura, latestOuraSampleAt == nil || t > (latestOuraSampleAt ?? .distantPast) { latestOuraSampleAt = t }
                lock.unlock()
                group.leave()
            }
        }

        // ----- HR (per-sample, for true event-window peak HR) -----
        // Collected as [{ "t": ISO8601, "v": bpm }, ...] per local day.
        // Used by cause-effect-engine to compute peak HR within each
        // calendar event window vs the user's resting baseline.
        if let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            group.enter()
            queryQuantitySamples(type: hrType, unit: HKUnit(from: "count/min"), start: startDate, end: endDate) { dayMap in
                lock.lock()
                for (day, samplesArr) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    entry["hr_samples"] = samplesArr
                    dailySamples[day] = entry
                }
                lock.unlock()
                group.leave()
            }
        }

        // ----- Sleep -----
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            querySleepDaily(type: sleepType, start: startDate, end: endDate) { dayMap, sourceMap, latestOura in
                lock.lock()
                for (day, sleep) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    if let total = sleep["total"] { entry["total_sleep_minutes"] = total }
                    if let deep = sleep["deep"] { entry["deep_sleep_minutes"] = deep }
                    if let rem = sleep["rem"] { entry["rem_sleep_minutes"] = rem }
                    if let score = sleep["score"] { entry["sleep_score"] = score }
                    dailySamples[day] = entry
                }
                for (day, bundles) in sourceMap { mergeSources(day: day, metric: "sleep", bundles: bundles) }
                if let t = latestOura, latestOuraSampleAt == nil || t > (latestOuraSampleAt ?? .distantPast) { latestOuraSampleAt = t }
                lock.unlock()
                group.leave()
            }
        }

        group.notify(queue: .global(qos: .background)) { [weak self] in
            guard let self = self else { done(); return }
            // Attach per-day source attribution + resolved provider label.
            var samples: [[String: Any]] = []
            for (day, var entry) in dailySamples {
                let hasPrimaryWearableMetric =
                    entry["hrv"] != nil ||
                    entry["resting_heart_rate"] != nil ||
                    entry["total_sleep_minutes"] != nil ||
                    entry["deep_sleep_minutes"] != nil ||
                    entry["rem_sleep_minutes"] != nil ||
                    entry["sleep_score"] != nil

                // Do not persist standalone heart-only daily rows. They tend to
                // look "empty" in product surfaces that focus on HRV/RHR/sleep,
                // and they are not enough on their own to represent a complete
                // wearable day. Heart metrics still merge into real days when
                // any primary wearable metric is present.
                guard hasPrimaryWearableMetric else { continue }

                if let byMetric = sourcesPerDay[day] {
                    var sourceApps: [String: [String]] = [:]
                    for (metric, bundles) in byMetric { sourceApps[metric] = Array(bundles).sorted() }
                    entry["source_apps"] = sourceApps
                    entry["source_provider"] = WearableSyncBridge.resolveProvider(sourceApps: sourceApps)
                }
                samples.append(entry)
            }
            if let t = latestOuraSampleAt { NativeSyncDiagnostics.shared.recordOuraSample(at: t) }
            if !samples.isEmpty {
                // Persist payload to native outbox FIRST so a process kill mid-upload
                // never loses the data.
                let payload: [String: Any] = [
                    "samples": samples,
                    "source": "ios-background",
                ]
                NativeOutbox.shared.enqueue(provider: .appleHealth, payload: payload)
            } else {
                NSLog("[WearableSyncBridge] No new samples — will still drain any pending outbox items")
            }
            // Drain ALL pending health items (including the one we just enqueued + any
            // previous items that failed on prior launches). Each successful upload
            // removes the item; each failure bumps retry metadata.
            self.drainOutbox(token: token, done: done)
        }
    }

    // MARK: - Source detection helpers

    /// Classify a HealthKit sample's source bundle ID into a high-level provider tag.
    /// Examples:
    ///   com.ouraring.oura            -> "oura"
    ///   com.apple.health             -> "apple_health"
    ///   com.apple.HealthDataDaemon   -> "apple_health"
    ///   com.apple.Health             -> "apple_health"
    ///   *.applewatch / Watch device  -> "apple_watch"
    static func providerForBundle(_ bundleId: String) -> String {
        let b = bundleId.lowercased()
        if b.contains("ouraring") || b.contains("oura") { return "oura" }
        if b.contains("whoop") { return "whoop" }
        if b.contains("garmin") { return "garmin" }
        if b.contains("polar") { return "polar" }
        if b.contains("fitbit") { return "fitbit" }
        if b.contains("apple") { return "apple_health" }
        return "other"
    }

    /// Resolve a single top-level provider label from per-metric bundle IDs.
    /// Priority: if Oura is the source for at least one of HRV/RHR/HR/Sleep,
    /// tag the day `oura_via_apple_health`. Else Apple Watch via Apple Health.
    /// Else generic apple_health. Mixed-third-party = `mixed_via_apple_health`.
    static func resolveProvider(sourceApps: [String: [String]]) -> String {
        var providers = Set<String>()
        for (_, bundles) in sourceApps {
            for b in bundles { providers.insert(providerForBundle(b)) }
        }
        if providers.contains("oura") { return "oura_via_apple_health" }
        let thirdParty = providers.subtracting(["apple_health", "other"])
        if thirdParty.count > 1 { return "mixed_via_apple_health" }
        if let only = thirdParty.first { return "\(only)_via_apple_health" }
        // Apple-only — assume Apple Watch when HR/HRV/RHR present (iPhone alone can't measure HRV).
        if sourceApps["hrv"] != nil || sourceApps["resting_heart_rate"] != nil { return "apple_watch_via_apple_health" }
        return "apple_health"
    }

    /// Public entry point used by the plugin and AppDelegate to drain the outbox
    /// without first re-querying HealthKit (e.g. on app launch / resume / reconnect).
    @objc public func flushOutbox(done: @escaping () -> Void) {
        guard let token = readKeychain(key: kKeychainTokenKey), !token.isEmpty else {
            NSLog("[WearableSyncBridge] flushOutbox: no token — skipping")
            done()
            return
        }
        drainOutbox(token: token, done: done)
    }

    /// Serialised FIFO outbox drain.
    ///
    /// Rationale (see docs / concurrency review): parallel POSTs from a single
    /// device created a write-storm on the server-side `atomicMergeUpsertWearable`
    /// CAS loop for the same (user_id, summary_date). We now upload strictly
    /// one payload at a time, remove the outbox item only on confirmed 2xx,
    /// keep failures in the outbox for the next drain, and hold a single-flight
    /// gate so overlapping observer / background-fetch fires cannot start two
    /// concurrent drains.
    private static let drainLock = NSLock()
    private static var drainInFlight = false
    private static let drainQueue = DispatchQueue(label: "mindmodule.wearable.outbox.drain")

    private func drainOutbox(token: String, done: @escaping () -> Void) {
        WearableSyncBridge.drainLock.lock()
        if WearableSyncBridge.drainInFlight {
            WearableSyncBridge.drainLock.unlock()
            NSLog("[WearableSyncBridge] drainOutbox: another drain in-flight — skipping")
            done()
            return
        }
        WearableSyncBridge.drainInFlight = true
        WearableSyncBridge.drainLock.unlock()

        let finish: () -> Void = {
            WearableSyncBridge.drainLock.lock()
            WearableSyncBridge.drainInFlight = false
            WearableSyncBridge.drainLock.unlock()
            done()
        }

        WearableSyncBridge.drainQueue.async {
            let items = NativeOutbox.shared.peek(provider: .appleHealth)
            NSLog("[WearableSyncBridge] drainOutbox start: depth=\(items.count)")
            if items.isEmpty { finish(); return }
            self.drainNext(items, index: 0, token: token, done: finish)
        }
    }

    /// Recursive serial pump: post item[i], then advance to i+1 only after the
    /// callback has fired. Guarantees strict FIFO one-at-a-time semantics
    /// without spawning parallel URLSession tasks.
    private func drainNext(
        _ items: [NativeOutbox.Item],
        index: Int,
        token: String,
        done: @escaping () -> Void
    ) {
        if index >= items.count {
            let remaining = NativeOutbox.shared.depth(provider: .appleHealth)
            NSLog("[WearableSyncBridge] drainOutbox done: remaining=\(remaining)")
            done()
            return
        }
        let item = items[index]
        postOutboxItem(item, token: token) {
            self.drainNext(items, index: index + 1, token: token, done: done)
        }
    }

    private func postOutboxItem(_ item: NativeOutbox.Item, token: String, done: @escaping () -> Void) {
        var request = URLRequest(url: edgeFunctionURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30
        request.setValue(item.id, forHTTPHeaderField: "X-Outbox-Item-Id") // server-side dedupe hint

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: item.payload)
        } catch {
            NativeOutbox.shared.markFailure(id: item.id, provider: .appleHealth, error: "serialize: \(error.localizedDescription)")
            done()
            return
        }

        let startedAt = Date()
        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            let latencyMs = Int(Date().timeIntervalSince(startedAt) * 1000.0)
            if let error = error {
                NSLog("[WearableSyncBridge] outbox POST failed: \(error.localizedDescription)")
                NativeOutbox.shared.markFailure(id: item.id, provider: .appleHealth, error: error.localizedDescription)
                NativeSyncDiagnostics.shared.recordUploadError("apple-health: \(error.localizedDescription)")
                done()
                return
            }
            if let http = response as? HTTPURLResponse {
                if (200..<300).contains(http.statusCode) {
                    NSLog("[WearableSyncBridge] outbox POST ok: \(http.statusCode), item \(item.id)")
                    NativeOutbox.shared.remove(id: item.id, provider: .appleHealth)
                    NativeSyncDiagnostics.shared.recordHealthUpload()
                    NativeSyncDiagnostics.shared.recordUploadLatency(ms: latencyMs)
                } else {
                    let msg = "http \(http.statusCode)"
                    NSLog("[WearableSyncBridge] outbox POST non-2xx: \(msg), item \(item.id)")
                    NativeOutbox.shared.markFailure(id: item.id, provider: .appleHealth, error: msg)
                    NativeSyncDiagnostics.shared.recordUploadError("apple-health: \(msg)")
                }
            }
            done()
        }
        task.resume()
    }

    // MARK: - HealthKit query helpers

    /// Average a quantity per local day (calendar day in user's timezone).
    private func queryQuantityDaily(
        type: HKQuantityType,
        unit: HKUnit,
        start: Date,
        end: Date,
        completion: @escaping (_ avgByDay: [String: Double], _ sourcesByDay: [String: [String]], _ latestOuraSampleAt: Date?) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
            if let error = error {
                NSLog("[WearableSyncBridge] Quantity query failed for \(type.identifier): \(error.localizedDescription)")
                completion([:], [:], nil)
                return
            }
            guard let quantitySamples = samples as? [HKQuantitySample] else {
                completion([:], [:], nil)
                return
            }
            var byDay: [String: [Double]] = [:]
            var sourcesByDay: [String: Set<String>] = [:]
            var latestOura: Date? = nil
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = TimeZone.current
            for s in quantitySamples {
                let dayKey = formatter.string(from: s.endDate)
                let value = s.quantity.doubleValue(for: unit)
                if value <= 0 { continue }
                byDay[dayKey, default: []].append(value)
                let bundle = s.sourceRevision.source.bundleIdentifier
                if !bundle.isEmpty {
                    sourcesByDay[dayKey, default: Set()].insert(bundle)
                    if WearableSyncBridge.providerForBundle(bundle) == "oura" {
                        if latestOura == nil || s.endDate > (latestOura ?? .distantPast) { latestOura = s.endDate }
                    }
                }
            }
            var avg: [String: Double] = [:]
            for (day, vals) in byDay {
                let sum = vals.reduce(0, +)
                avg[day] = sum / Double(vals.count)
            }
            var sourceArrays: [String: [String]] = [:]
            for (day, set) in sourcesByDay { sourceArrays[day] = Array(set) }
            completion(avg, sourceArrays, latestOura)
        }
        healthStore.execute(query)
    }

    /// Return per-sample readings grouped by local day as
    /// [{ "t": ISO8601, "v": Int }]. Used by the cause-effect engine to
    /// compute per-event-window peak HR (true causation) rather than a
    /// daily-average proxy.
    private func queryQuantitySamples(
        type: HKQuantityType,
        unit: HKUnit,
        start: Date,
        end: Date,
        completion: @escaping ([String: [[String: Any]]]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
            if let error = error {
                NSLog("[WearableSyncBridge] Per-sample query failed for \(type.identifier): \(error.localizedDescription)")
                completion([:])
                return
            }
            guard let quantitySamples = samples as? [HKQuantitySample] else {
                completion([:])
                return
            }
            let dayFormatter = DateFormatter()
            dayFormatter.dateFormat = "yyyy-MM-dd"
            dayFormatter.timeZone = TimeZone.current
            let isoFormatter = ISO8601DateFormatter()
            isoFormatter.formatOptions = [.withInternetDateTime]
            var byDay: [String: [[String: Any]]] = [:]
            for s in quantitySamples {
                let value = s.quantity.doubleValue(for: unit)
                if value <= 0 { continue }
                let dayKey = dayFormatter.string(from: s.startDate)
                let sample: [String: Any] = [
                    "t": isoFormatter.string(from: s.startDate),
                    "v": Int(round(value)),
                ]
                byDay[dayKey, default: []].append(sample)
            }
            completion(byDay)
        }
        healthStore.execute(query)
    }

    /// Aggregate sleep per local day (attribute to wake-up day).
    /// Prefers staged sleep rows when available; otherwise falls back to
    /// umbrella sleep rows (`asleep` / `asleepUnspecified`) so devices that
    /// do not emit stage breakdowns still produce total sleep minutes.
    private func querySleepDaily(
        type: HKCategoryType,
        start: Date,
        end: Date,
        completion: @escaping (_ byDay: [String: [String: Int]], _ sourcesByDay: [String: [String]], _ latestOuraSampleAt: Date?) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
            if let error = error {
                NSLog("[WearableSyncBridge] Sleep query failed: \(error.localizedDescription)")
                completion([:], [:], nil)
                return
            }
            guard let categorySamples = samples as? [HKCategorySample] else {
                completion([:], [:], nil)
                return
            }
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = TimeZone.current

            // Per-day buckets
            var perStage: [String: Int] = [:]   // deep+rem+core (excl awake)
            var hasStageRows: [String: Bool] = [:]
            var asleepUmbrella: [String: Int] = [:]
            var deep: [String: Int] = [:]
            var rem: [String: Int] = [:]
            var inBed: [String: Int] = [:]
            var sourcesByDay: [String: Set<String>] = [:]
            var latestOura: Date? = nil

            for s in categorySamples {
                let day = formatter.string(from: s.endDate)
                let mins = Int(s.endDate.timeIntervalSince(s.startDate) / 60.0)
                if mins <= 0 { continue }
                guard let value = HKCategoryValueSleepAnalysis(rawValue: s.value) else { continue }
                let bundle = s.sourceRevision.source.bundleIdentifier
                if !bundle.isEmpty {
                    sourcesByDay[day, default: Set()].insert(bundle)
                    if WearableSyncBridge.providerForBundle(bundle) == "oura" {
                        if latestOura == nil || s.endDate > (latestOura ?? .distantPast) { latestOura = s.endDate }
                    }
                }
                if #available(iOS 16.0, *) {
                    switch value {
                    case .asleepDeep:
                        hasStageRows[day] = true
                        deep[day, default: 0] += mins
                        perStage[day, default: 0] += mins
                    case .asleepREM:
                        hasStageRows[day] = true
                        rem[day, default: 0] += mins
                        perStage[day, default: 0] += mins
                    case .asleepCore:
                        hasStageRows[day] = true
                        perStage[day, default: 0] += mins
                    case .asleepUnspecified:
                        if hasStageRows[day] != true {
                            asleepUmbrella[day, default: 0] += mins
                        }
                    case .asleep:
                        if hasStageRows[day] != true {
                            asleepUmbrella[day, default: 0] += mins
                        }
                    case .inBed:
                        inBed[day, default: 0] += mins
                    case .awake:
                        break // excluded from sleep
                    @unknown default:
                        break
                    }
                } else {
                    switch value {
                    case .asleep:
                        asleepUmbrella[day, default: 0] += mins
                    case .inBed:
                        inBed[day, default: 0] += mins
                    case .awake:
                        break
                    @unknown default:
                        break
                    }
                }
            }

            var result: [String: [String: Int]] = [:]
            let allDays = Set(perStage.keys).union(asleepUmbrella.keys).union(inBed.keys)
            for day in allDays {
                let total: Int = (perStage[day] ?? 0) > 0 ? (perStage[day] ?? 0) : (asleepUmbrella[day] ?? 0)
                if total <= 0 { continue }
                var entry: [String: Int] = ["total": total]
                if let d = deep[day], d > 0 { entry["deep"] = d }
                if let r = rem[day], r > 0 { entry["rem"] = r }
                let bed = inBed[day] ?? 0
                if total + bed > 0 {
                    let score = Int(round((Double(total) / Double(total + bed)) * 100.0))
                    entry["score"] = max(0, min(100, score))
                } else {
                    let hours = Double(total) / 60.0
                    let score = hours >= 7 ? min(95, Int(round(70 + hours * 3))) : max(30, Int(round(hours * 10)))
                    entry["score"] = score
                }
                result[day] = entry
            }
            var sourceArrays: [String: [String]] = [:]
            for (day, set) in sourcesByDay { sourceArrays[day] = Array(set) }
            completion(result, sourceArrays, latestOura)
        }
        healthStore.execute(query)
    }

    // MARK: - Network

    private func postToEdgeFunction(samples: [[String: Any]], token: String, done: @escaping () -> Void) {
        var request = URLRequest(url: edgeFunctionURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let payload: [String: Any] = [
            "samples": samples,
            "source": "ios-background",
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        } catch {
            NSLog("[WearableSyncBridge] JSON serialize failed: \(error.localizedDescription)")
            done()
            return
        }

        let task = URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                NSLog("[WearableSyncBridge] POST failed: \(error.localizedDescription)")
                done()
                return
            }
            if let http = response as? HTTPURLResponse {
                NSLog("[WearableSyncBridge] POST status: \(http.statusCode), samples: \(samples.count)")
            }
            done()
        }
        task.resume()
    }

    // MARK: - Keychain helpers

    private func readKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
