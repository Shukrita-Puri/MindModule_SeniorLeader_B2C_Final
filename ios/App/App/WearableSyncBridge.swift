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
            healthStore.enableBackgroundDelivery(for: type, frequency: .hourly) { success, error in
                if let error = error {
                    NSLog("[WearableSyncBridge] enableBackgroundDelivery error for \(type.identifier): \(error.localizedDescription)")
                } else {
                    NSLog("[WearableSyncBridge] Background delivery enabled for \(type.identifier): \(success)")
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

        let endDate = Date()
        let startDate = Calendar.current.date(byAdding: .day, value: -7, to: endDate) ?? endDate

        let group = DispatchGroup()
        // dayKey -> partial sample
        var dailySamples: [String: [String: Any]] = [:]
        let lock = NSLock()

        // ----- HRV -----
        if let hrvType = HKObjectType.quantityType(forIdentifier: .heartRateVariabilitySDNN) {
            group.enter()
            queryQuantityDaily(type: hrvType, unit: HKUnit.secondUnit(with: .milli), start: startDate, end: endDate) { dayMap in
                lock.lock()
                for (day, value) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    entry["hrv"] = value
                    dailySamples[day] = entry
                }
                lock.unlock()
                group.leave()
            }
        }

        // ----- RHR -----
        if let rhrType = HKObjectType.quantityType(forIdentifier: .restingHeartRate) {
            group.enter()
            queryQuantityDaily(type: rhrType, unit: HKUnit(from: "count/min"), start: startDate, end: endDate) { dayMap in
                lock.lock()
                for (day, value) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    entry["resting_heart_rate"] = Int(round(value))
                    dailySamples[day] = entry
                }
                lock.unlock()
                group.leave()
            }
        }

        // ----- HR (avg) -----
        if let hrType = HKObjectType.quantityType(forIdentifier: .heartRate) {
            group.enter()
            queryQuantityDaily(type: hrType, unit: HKUnit(from: "count/min"), start: startDate, end: endDate) { dayMap in
                lock.lock()
                for (day, value) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    entry["heart_rate"] = Int(round(value))
                    dailySamples[day] = entry
                }
                lock.unlock()
                group.leave()
            }
        }

        // ----- Sleep -----
        if let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis) {
            group.enter()
            querySleepDaily(type: sleepType, start: startDate, end: endDate) { dayMap in
                lock.lock()
                for (day, sleep) in dayMap {
                    var entry = dailySamples[day] ?? ["summary_date": day]
                    if let total = sleep["total"] { entry["total_sleep_minutes"] = total }
                    if let deep = sleep["deep"] { entry["deep_sleep_minutes"] = deep }
                    if let rem = sleep["rem"] { entry["rem_sleep_minutes"] = rem }
                    if let score = sleep["score"] { entry["sleep_score"] = score }
                    dailySamples[day] = entry
                }
                lock.unlock()
                group.leave()
            }
        }

        group.notify(queue: .global(qos: .background)) { [weak self] in
            guard let self = self else { done(); return }
            let samples = Array(dailySamples.values)
            if samples.isEmpty {
                NSLog("[WearableSyncBridge] No samples to persist")
                done()
                return
            }
            self.postToEdgeFunction(samples: samples, token: token, done: done)
        }
    }

    // MARK: - HealthKit query helpers

    /// Average a quantity per local day (calendar day in user's timezone).
    private func queryQuantityDaily(
        type: HKQuantityType,
        unit: HKUnit,
        start: Date,
        end: Date,
        completion: @escaping ([String: Double]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
            if let error = error {
                NSLog("[WearableSyncBridge] Quantity query failed for \(type.identifier): \(error.localizedDescription)")
                completion([:])
                return
            }
            guard let quantitySamples = samples as? [HKQuantitySample] else {
                completion([:])
                return
            }
            var byDay: [String: [Double]] = [:]
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = TimeZone.current
            for s in quantitySamples {
                let dayKey = formatter.string(from: s.endDate)
                let value = s.quantity.doubleValue(for: unit)
                if value <= 0 { continue }
                byDay[dayKey, default: []].append(value)
            }
            var avg: [String: Double] = [:]
            for (day, vals) in byDay {
                let sum = vals.reduce(0, +)
                avg[day] = sum / Double(vals.count)
            }
            completion(avg)
        }
        healthStore.execute(query)
    }

    /// Aggregate sleep per local day (attribute to wake-up day).
    /// Prefers per-stage rows; falls back to .asleepUnspecified umbrella when no per-stage data exists.
    private func querySleepDaily(
        type: HKCategoryType,
        start: Date,
        end: Date,
        completion: @escaping ([String: [String: Int]]) -> Void
    ) {
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)
        let query = HKSampleQuery(sampleType: type, predicate: predicate, limit: HKObjectQueryNoLimit, sortDescriptors: nil) { _, samples, error in
            if let error = error {
                NSLog("[WearableSyncBridge] Sleep query failed: \(error.localizedDescription)")
                completion([:])
                return
            }
            guard let categorySamples = samples as? [HKCategorySample] else {
                completion([:])
                return
            }
            let formatter = DateFormatter()
            formatter.dateFormat = "yyyy-MM-dd"
            formatter.timeZone = TimeZone.current

            // Per-day buckets
            var perStage: [String: Int] = [:]   // deep+rem+core (excl awake)
            var asleepUmbrella: [String: Int] = [:]
            var deep: [String: Int] = [:]
            var rem: [String: Int] = [:]
            var inBed: [String: Int] = [:]

            for s in categorySamples {
                let day = formatter.string(from: s.endDate)
                let mins = Int(s.endDate.timeIntervalSince(s.startDate) / 60.0)
                if mins <= 0 { continue }
                guard let value = HKCategoryValueSleepAnalysis(rawValue: s.value) else { continue }
                switch value {
                case .asleepDeep:
                    deep[day, default: 0] += mins
                    perStage[day, default: 0] += mins
                case .asleepREM:
                    rem[day, default: 0] += mins
                    perStage[day, default: 0] += mins
                case .asleepCore:
                    perStage[day, default: 0] += mins
                case .asleepUnspecified:
                    asleepUmbrella[day, default: 0] += mins
                case .inBed:
                    inBed[day, default: 0] += mins
                case .awake:
                    break // excluded from sleep
                @unknown default:
                    break
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
            completion(result)
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
