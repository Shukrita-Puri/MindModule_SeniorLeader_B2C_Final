import Foundation
import Capacitor
import UserNotifications
import UIKit

@objc(NotificationAuthorizationPlugin)
public class NotificationAuthorizationPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "NotificationAuthorizationPlugin"
    public let jsName = "NotificationAuthorization"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestProvisionalPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestFullPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openAppSettings", returnType: CAPPluginReturnPromise),
    ]

    @objc func getStatus(_ call: CAPPluginCall) {
        resolveSettings(call: call)
    }

    @objc func requestProvisionalPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound, .provisional]) { _, error in
            if let error = error {
                call.reject("Notification provisional permission error: \(error.localizedDescription)")
                return
            }
            self.resolveSettings(call: call)
        }
    }

    @objc func requestFullPermission(_ call: CAPPluginCall) {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .badge, .sound]) { _, error in
            if let error = error {
                call.reject("Notification permission error: \(error.localizedDescription)")
                return
            }
            self.resolveSettings(call: call)
        }
    }

    @objc func openAppSettings(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let url = URL(string: UIApplication.openSettingsURLString) else {
                call.reject("Settings URL unavailable")
                return
            }
            UIApplication.shared.open(url, options: [:]) { opened in
                call.resolve(["opened": opened])
            }
        }
    }

    private func resolveSettings(call: CAPPluginCall) {
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            DispatchQueue.main.async {
                call.resolve([
                    "authorizationStatus": self.authorizationStatusLabel(settings.authorizationStatus),
                    "alertSetting": self.settingLabel(settings.alertSetting),
                    "badgeSetting": self.settingLabel(settings.badgeSetting),
                    "soundSetting": self.settingLabel(settings.soundSetting),
                    "notificationCenterSetting": self.settingLabel(settings.notificationCenterSetting),
                    "lockScreenSetting": self.settingLabel(settings.lockScreenSetting),
                    "backgroundRefreshStatus": self.backgroundRefreshStatusLabel(UIApplication.shared.backgroundRefreshStatus),
                    "quietAuthorization": settings.authorizationStatus == .provisional,
                    "canRequestFullPrompt": settings.authorizationStatus == .notDetermined || settings.authorizationStatus == .provisional,
                ])
            }
        }
    }

    private func authorizationStatusLabel(_ status: UNAuthorizationStatus) -> String {
        switch status {
        case .notDetermined:
            return "not_determined"
        case .denied:
            return "denied"
        case .authorized:
            return "authorized"
        case .provisional:
            return "provisional"
        case .ephemeral:
            return "ephemeral"
        @unknown default:
            return "unknown"
        }
    }

    private func settingLabel(_ setting: UNNotificationSetting) -> String {
        switch setting {
        case .notSupported:
            return "not_supported"
        case .disabled:
            return "disabled"
        case .enabled:
            return "enabled"
        @unknown default:
            return "unknown"
        }
    }

    private func backgroundRefreshStatusLabel(_ status: UIBackgroundRefreshStatus) -> String {
        switch status {
        case .available:
            return "available"
        case .denied:
            return "denied"
        case .restricted:
            return "restricted"
        @unknown default:
            return "unknown"
        }
    }
}
