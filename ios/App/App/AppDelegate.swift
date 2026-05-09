import UIKit
import Capacitor
import UserNotifications

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Set notification center delegate for foreground notifications
        UNUserNotificationCenter.current().delegate = self

        // Register HealthKit background observers so iOS can wake the app silently
        // when new HRV/RHR/HR/Sleep samples arrive — keeps wearable_data flowing
        // without requiring the user to open the app. Permission must already be
        // granted (handled by JS layer); if not, observers fire harmlessly.
        WearableSyncBridge.shared.registerBackgroundObservers()

        // Ask iOS to opportunistically wake the app for background fetch.
        // The actual cadence is controlled by iOS based on usage, battery, and
        // network conditions.
        application.setMinimumBackgroundFetchInterval(UIApplication.backgroundFetchIntervalMinimum)

        return true
    }

    // MARK: - Background fetch (belt-and-braces)
    // iOS may also call this on its own schedule. We sync HealthKit and Apple
    // Calendar natively because JS timers do not run while the app is suspended.
    func application(_ application: UIApplication, performFetchWithCompletionHandler completionHandler: @escaping (UIBackgroundFetchResult) -> Void) {
        NativeSyncDiagnostics.shared.recordBackgroundFetch()
        let group = DispatchGroup()

        group.enter()
        WearableSyncBridge.shared.fetchAndPersist {
            group.leave()
        }

        group.enter()
        AppleCalendarBackgroundSyncBridge.shared.fetchAndPersist {
            group.leave()
        }

        group.notify(queue: .main) {
            completionHandler(.newData)
        }
    }

    // MARK: - Remote Notification Registration

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Forward the device token to Capacitor's Push Notifications plugin
        NotificationCenter.default.post(
            name: .capacitorDidRegisterForRemoteNotifications,
            object: deviceToken
        )
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Forward the error to Capacitor's Push Notifications plugin
        NotificationCenter.default.post(
            name: .capacitorDidFailToRegisterForRemoteNotifications,
            object: error
        )
    }

    // MARK: - UNUserNotificationCenterDelegate

    // Show notifications even when the app is in the foreground
    func userNotificationCenter(_ center: UNUserNotificationCenter,
                                willPresent notification: UNNotification,
                                withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .badge, .sound])
    }

    // MARK: - App Lifecycle

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Drain any payloads that were queued while the app was backgrounded
        // or terminated. JS layer will also retry, but a native flush guarantees
        // we don't depend on the WebView being alive.
        WearableSyncBridge.shared.flushOutbox {}
        AppleCalendarBackgroundSyncBridge.shared.flushOutbox {}
    }

    func applicationDidBecomeActive(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
