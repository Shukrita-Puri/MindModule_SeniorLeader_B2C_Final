// HealthKitSampleNormalizer
//
// Maps native HealthKit samples into the canonical backend payload
// shape (matches `persist-wearable-data` bulk contract). Emits stable
// per-sample `identityKey`s so NativeSyncOutbox can dedupe retries
// and observer + foreground races without duplicating uploads.
//
// Sleep collapse rule: HealthKit surfaces both an umbrella
// `HKCategoryValueSleepAnalysis.asleep` row AND per-stage rows
// (`asleepCore`, `asleepDeep`, `asleepREM`, `asleepUnspecified`) for
// the same wall-clock window on Apple Watch. Summing all rows double-
// counts sleep. When ANY stage row is present in a bucket, umbrella
// rows in that bucket are dropped.

import Foundation
import HealthKit

public struct NormalizedSample {
    public let identityKey: String   // "<metric>|<startISO>|<sourceBundle>"
    public let payload: [String: Any] // matches persist-wearable-data samples[] entry
}

public enum HealthKitSampleNormalizer {

    // MARK: - Quantity samples (HRV / RHR / HR)

    public static func normalizeQuantity(
        _ samples: [HKQuantitySample],
        metric: String,
        unit: HKUnit
    ) -> [NormalizedSample] {
        samples.compactMap { s in
            let value = s.quantity.doubleValue(for: unit)
            guard value.isFinite else { return nil }
            let startISO = isoFormatter.string(from: s.startDate)
            let endISO = isoFormatter.string(from: s.endDate)
            let bundle = s.sourceRevision.source.bundleIdentifier
            let identity = "\(metric)|\(startISO)|\(bundle)"
            return NormalizedSample(
                identityKey: identity,
                payload: [
                    "metric": metric,
                    "value": value,
                    "startDate": startISO,
                    "endDate": endISO,
                    "sourceBundleId": bundle,
                    "sourceName": s.sourceRevision.source.name,
                    "uuid": s.uuid.uuidString,
                ]
            )
        }
    }

    // MARK: - Sleep (category samples)

    public static func normalizeSleep(_ samples: [HKCategorySample]) -> [NormalizedSample] {
        // 1. Split into per-day buckets keyed by localized YYYY-MM-DD of endDate.
        let cal = Calendar(identifier: .gregorian)
        var byDay: [String: [HKCategorySample]] = [:]
        for s in samples {
            let comps = cal.dateComponents([.year, .month, .day], from: s.endDate)
            let key = String(format: "%04d-%02d-%02d",
                             comps.year ?? 0, comps.month ?? 0, comps.day ?? 0)
            byDay[key, default: []].append(s)
        }

        var out: [NormalizedSample] = []
        for (_, daySamples) in byDay {
            let hasStageRows = daySamples.contains { isStageRow($0.value) }
            let filtered: [HKCategorySample] = hasStageRows
                ? daySamples.filter { $0.value != HKCategoryValueSleepAnalysis.asleep.rawValue }
                : daySamples

            for s in filtered {
                let startISO = isoFormatter.string(from: s.startDate)
                let endISO = isoFormatter.string(from: s.endDate)
                let bundle = s.sourceRevision.source.bundleIdentifier
                // Identity: sleep stage rows get metric per-stage so umbrella and
                // stage rows cannot collide.
                let stage = sleepStageLabel(s.value)
                let identity = "sleep-\(stage)|\(startISO)|\(bundle)"
                out.append(NormalizedSample(
                    identityKey: identity,
                    payload: [
                        "metric": "sleep",
                        "stage": stage,
                        "value": s.endDate.timeIntervalSince(s.startDate),
                        "startDate": startISO,
                        "endDate": endISO,
                        "sourceBundleId": bundle,
                        "sourceName": s.sourceRevision.source.name,
                        "uuid": s.uuid.uuidString,
                    ]
                ))
            }
        }
        return out
    }

    private static func isStageRow(_ raw: Int) -> Bool {
        switch raw {
        case HKCategoryValueSleepAnalysis.asleepCore.rawValue,
             HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
             HKCategoryValueSleepAnalysis.asleepREM.rawValue,
             HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue:
            return true
        default:
            return false
        }
    }

    private static func sleepStageLabel(_ raw: Int) -> String {
        if raw == HKCategoryValueSleepAnalysis.asleepCore.rawValue { return "core" }
        if raw == HKCategoryValueSleepAnalysis.asleepDeep.rawValue { return "deep" }
        if raw == HKCategoryValueSleepAnalysis.asleepREM.rawValue { return "rem" }
        if raw == HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue { return "unspecified" }
        if raw == HKCategoryValueSleepAnalysis.asleep.rawValue { return "asleep" }
        if raw == HKCategoryValueSleepAnalysis.awake.rawValue { return "awake" }
        if raw == HKCategoryValueSleepAnalysis.inBed.rawValue { return "inBed" }
        return "other"
    }

    // MARK: - Shared formatter

    private static let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()
}