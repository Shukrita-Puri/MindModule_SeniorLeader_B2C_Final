//
//  LocationBridgePlugin.swift
//  Mind Module
//  Capacitor wrapper around LocationBridge.swift.
//

import Foundation
import Capacitor

@objc(LocationBridgePlugin)
public class LocationBridgePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocationBridgePlugin"
    public let jsName = "LocationBridge"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "startIfAuthorized", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAlwaysAuthorization", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestWhenInUseAuthorization", returnType: CAPPluginReturnPromise),

        CAPPluginMethod(name: "requestOneShotLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentAuthorizationString", returnType: CAPPluginReturnPromise),
    ]

    private var timezoneObserver: NSObjectProtocol?

    override public func load() {
        super.load()
        if timezoneObserver == nil {
            timezoneObserver = NotificationCenter.default.addObserver(
                forName: .mindModuleTimezoneChanged,
                object: nil,
                queue: .main
            ) { [weak self] note in
                guard let self = self else { return }
                let timezone = note.userInfo?["timezone"] as? String ?? TimeZone.current.identifier
                let at = note.userInfo?["at"] as? Double ?? (Date().timeIntervalSince1970 * 1000)
                NSLog("[LocationBridgePlugin] Timezone changed — notifying JS (\(timezone))")
                self.notifyListeners("timezoneChanged", data: [
                    "timezone": timezone,
                    "at": at
                ])
            }
        }
    }

    deinit {
        if let observer = timezoneObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    @objc func startIfAuthorized(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LocationBridge.shared.startIfAuthorized()
            call.resolve()
        }
    }

    @objc func requestAlwaysAuthorization(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LocationBridge.shared.requestAlwaysAuthorization()
            call.resolve()
        }
    }

    @objc func requestWhenInUseAuthorization(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LocationBridge.shared.requestWhenInUseAuthorization()
            call.resolve()
        }
    }


    @objc func requestOneShotLocation(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            LocationBridge.shared.requestOneShotLocation()
            call.resolve()
        }
    }

    @objc func currentAuthorizationString(_ call: CAPPluginCall) {
        let value = LocationBridge.shared.currentAuthorizationString()
        call.resolve(["value": value])
    }
}
