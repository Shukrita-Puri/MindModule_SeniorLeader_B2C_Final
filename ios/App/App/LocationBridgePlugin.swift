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
        CAPPluginMethod(name: "requestOneShotLocation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentAuthorizationString", returnType: CAPPluginReturnPromise),
    ]

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