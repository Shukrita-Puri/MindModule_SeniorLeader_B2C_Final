//
//  LocationBridge.swift
//  Mind Module
//
//  Native iOS travel-aware location + timezone bridge.
//  - Uses CLLocationManager.startMonitoringSignificantLocationChanges
//    (battery-friendly, wakes the app even after termination).
//  - Uses CLLocationManager.startMonitoringVisits to detect arrivals/departures.
//  - Observes NSSystemTimeZoneDidChange to react to TZ changes the moment
//    iOS rotates the device clock.
//  - Forwards each event to the `persist-travel-location` Supabase edge
//    function via the same Keychain-stored Auth0 token used by
//    WearableSyncBridge. Failures are best-effort and never crash.
//
//  Permission strategy:
//    The JS layer (travelStateService) is responsible for *requesting*
//    permission so we can show in-app rationale first. This bridge only
//    *uses* whatever level of authorization is already granted. If
//    authorization is denied or restricted we simply no-op — we never
//    re-prompt natively.
//

import Foundation
import CoreLocation
import UIKit

extension Notification.Name {
    static let mindModuleTimezoneChanged = Notification.Name("MindModuleTimezoneChanged")
}

@objc public class LocationBridge: NSObject, CLLocationManagerDelegate {

    public static let shared = LocationBridge()

    private let manager = CLLocationManager()
    private let supabaseProjectId = "iyilcpvercoywaweybpc"
    private var edgeFunctionURL: URL {
        return URL(string: "https://\(supabaseProjectId).supabase.co/functions/v1/persist-travel-location")!
    }

    // Shared keychain key with WearableSyncBridge so we don't duplicate auth.
    private let kKeychainTokenKey = "mindmodule.auth0_token"

    // Throttle: at most one upload per 60s under normal conditions to keep
    // battery + network usage minimal. Visits + TZ changes bypass the throttle.
    private var lastUploadAt: TimeInterval = 0
    private let uploadThrottleSec: TimeInterval = 60

    private var started = false

    override init() {
        super.init()
        manager.delegate = self
        manager.desiredAccuracy = kCLLocationAccuracyHundredMeters
        manager.pausesLocationUpdatesAutomatically = true
        manager.allowsBackgroundLocationUpdates = true
        manager.showsBackgroundLocationIndicator = false
    }

    // MARK: - Public entrypoints

    /// Called from AppDelegate.didFinishLaunching. Idempotent.
    /// Only activates monitoring when the user has already granted
    /// `authorizedAlways` or `authorizedWhenInUse`.
    @objc public func startIfAuthorized() {
        registerTimezoneObserver()
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        guard status == .authorizedAlways || status == .authorizedWhenInUse else {
            NSLog("[LocationBridge] Not authorized (\(status.rawValue)) — skipping start")
            return
        }
        startMonitoring()
    }

    /// Called from JS after the user grants permission in-app.
    @objc public func requestAlwaysAuthorization() {
        manager.requestAlwaysAuthorization()
    }

    /// Called from JS to immediately request a one-shot fix (foreground use).
    @objc public func requestOneShotLocation() {
        manager.requestLocation()
    }

    /// Returns the current authorization as a string for JS telemetry.
    @objc public func currentAuthorizationString() -> String {
        let status: CLAuthorizationStatus
        if #available(iOS 14.0, *) {
            status = manager.authorizationStatus
        } else {
            status = CLLocationManager.authorizationStatus()
        }
        switch status {
        case .notDetermined: return "not_determined"
        case .restricted: return "restricted"
        case .denied: return "denied"
        case .authorizedAlways: return "authorized_always"
        case .authorizedWhenInUse: return "authorized_when_in_use"
        @unknown default: return "unknown"
        }
    }

    private func startMonitoring() {
        guard !started else { return }
        started = true
        manager.startMonitoringSignificantLocationChanges()
        manager.startMonitoringVisits()
        NSLog("[LocationBridge] Significant changes + visits monitoring active")
    }

    private func stopMonitoring() {
        guard started else { return }
        started = false
        manager.stopMonitoringSignificantLocationChanges()
        manager.stopMonitoringVisits()
    }

    // MARK: - Timezone observer

    private func registerTimezoneObserver() {
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(onTimezoneChanged),
            name: .NSSystemTimeZoneDidChange,
            object: nil
        )
    }

    @objc private func onTimezoneChanged() {
        let tz = TimeZone.current.identifier
        NSLog("[LocationBridge] System timezone changed → \(tz)")
        NotificationCenter.default.post(
            name: .mindModuleTimezoneChanged,
            object: nil,
            userInfo: [
                "timezone": tz,
                "at": Date().timeIntervalSince1970 * 1000
            ]
        )
        // Force-send the latest known location (if any) with the new TZ.
        // If we don't have one yet, send a TZ-only ping so the server can
        // still update travel_state.last_known_timezone.
        if let loc = manager.location {
            uploadPing(loc: loc, source: "ios-tz-change", force: true)
        } else {
            uploadTimezoneOnly(tz: tz)
        }
    }

    // MARK: - CLLocationManagerDelegate

    public func locationManager(_ manager: CLLocationManager, didChangeAuthorization status: CLAuthorizationStatus) {
        NSLog("[LocationBridge] Authorization changed → \(status.rawValue)")
        if status == .authorizedAlways || status == .authorizedWhenInUse {
            startMonitoring()
        } else {
            stopMonitoring()
        }
    }

    public func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let loc = locations.last else { return }
        uploadPing(loc: loc, source: "ios-significant", force: false)
    }

    public func locationManager(_ manager: CLLocationManager, didVisit visit: CLVisit) {
        // visits are high-signal (arrival/departure) — always forward.
        let loc = CLLocation(
            coordinate: visit.coordinate,
            altitude: 0,
            horizontalAccuracy: visit.horizontalAccuracy,
            verticalAccuracy: -1,
            timestamp: visit.arrivalDate == Date.distantPast ? Date() : visit.arrivalDate
        )
        let source = visit.departureDate == Date.distantFuture ? "ios-visit-arrival" : "ios-visit-departure"
        uploadPing(loc: loc, source: source, force: true)
    }

    public func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        // Don't propagate — iOS retries automatically.
        NSLog("[LocationBridge] didFailWithError: \(error.localizedDescription)")
    }

    // MARK: - Upload

    private func uploadPing(loc: CLLocation, source: String, force: Bool) {
        let now = Date().timeIntervalSince1970
        if !force && (now - lastUploadAt) < uploadThrottleSec { return }
        lastUploadAt = now

        guard let token = readKeychainToken() else {
            NSLog("[LocationBridge] No auth token in Keychain — skipping upload")
            return
        }

        let body: [String: Any] = [
            "lat": loc.coordinate.latitude,
            "lng": loc.coordinate.longitude,
            "accuracy_m": loc.horizontalAccuracy,
            "source": source,
            "timezone": TimeZone.current.identifier,
            "captured_at": ISO8601DateFormatter().string(from: loc.timestamp),
            "permission_status": currentAuthorizationString()
        ]
        post(body: body, token: token)
    }

    private func uploadTimezoneOnly(tz: String) {
        guard let token = readKeychainToken() else { return }
        let body: [String: Any] = [
            "timezone": tz,
            "source": "ios-tz-change",
            "captured_at": ISO8601DateFormatter().string(from: Date()),
            "permission_status": currentAuthorizationString()
        ]
        post(body: body, token: token)
    }

    private func post(body: [String: Any], token: String) {
        var req = URLRequest(url: edgeFunctionURL)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        URLSession.shared.dataTask(with: req) { _, resp, err in
            if let err = err {
                NSLog("[LocationBridge] upload failed: \(err.localizedDescription)")
                return
            }
            if let http = resp as? HTTPURLResponse, !(200..<300).contains(http.statusCode) {
                NSLog("[LocationBridge] upload non-2xx: \(http.statusCode)")
            }
        }.resume()
    }

    // MARK: - Keychain

    private func readKeychainToken() -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: kKeychainTokenKey,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
