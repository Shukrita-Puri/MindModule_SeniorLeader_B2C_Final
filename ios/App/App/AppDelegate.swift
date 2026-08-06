import UIKit
import Capacitor
import UserNotifications
import Network
import BackgroundTasks

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    var window: UIWindow?

    // Network reconnect monitor — drains the native outbox the moment the
    // device regains connectivity. Debounced + only fires when transitioning
    // from "no path" → "satisfied" so we don't drain on every Wi-Fi micro-blip.
    private let networkMonitor = NWPathMonitor()
    private let networkMonitorQueue = DispatchQueue(label: "mindmodule.networkMonitor")
    private var lastReconnectDrainAt: TimeInterval = 0
    private var lastPathStatus: NWPath.Status = .requiresConnection

    // BGTaskScheduler identifier — must also be listed in Info.plist under
    // BGTaskSchedulerPermittedIdentifiers.
    private let backgroundRefreshTaskId = "com.moonshot.mindmoduleapp.refresh"

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        // Set notification center delegate for foreground notifications
        UNUserNotificationCenter.current().delegate = self

        // Drain any notification receipts the extension cached while the app
        // was suspended, offline, or not yet launched.
        NotificationReceiptClient.shared.flushPending()

        // Register HealthKit background observers so iOS can wake the app silently
        // when new HRV/RHR/HR/Sleep samples arrive — keeps wearable_data flowing
        // without requiring the user to open the app. Permission must already be
        // granted (handled by JS layer); if not, observers fire harmlessly.
        WearableSyncBridge.shared.registerBackgroundObservers()

        // Native-authoritative Apple Health path (HealthKitSyncManager owns the
        // authoritative watch_sync_status writes via WearableStatusWriter).
        // Seed the Supabase base URL for the native writer up-front — the JS
        // layer pushes the auth token separately via NativeBackgroundSyncPlugin
        // once Auth0 is hydrated. Both calls are idempotent.
        SupabaseAuthTokenProvider.shared.updateSupabaseURL("https://iyilcpvercoywaweybpc.supabase.co")
        HealthKitSyncManager.shared.bootstrap()

        // Activate travel-aware location monitoring if the user already
        // granted location authorization. The JS layer handles the in-app
        // permission prompt the first time; we never re-prompt natively.
        LocationBridge.shared.startIfAuthorized()

        // Register BGAppRefreshTask handler. iOS chooses the actual cadence
        // based on usage, battery, and network conditions. We also keep the
        // legacy performFetchWithCompletionHandler path below as a belt-and-
        // braces fallback on older iOS versions.
        registerBackgroundRefreshTask()
        scheduleBackgroundRefresh()

        // Start the reconnect monitor.
        startNetworkMonitor()

        return true
    }

    // MARK: - BGTaskScheduler

    private func registerBackgroundRefreshTask() {
        BGTaskScheduler.shared.register(
            forTaskWithIdentifier: backgroundRefreshTaskId,
            using: nil
        ) { [weak self] task in
            guard let refreshTask = task as? BGAppRefreshTask else {
                task.setTaskCompleted(success: false)
                return
            }
            self?.handleBackgroundRefresh(task: refreshTask)
        }
    }

    private func scheduleBackgroundRefresh() {
        let request = BGAppRefreshTaskRequest(identifier: backgroundRefreshTaskId)
        // Target quarter-hourly cadence. iOS may delay further based on usage,
        // battery, and network — this is the *earliest* it will consider us.
        request.earliestBeginDate = Date(timeIntervalSinceNow: 15 * 60) // 15 minutes
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            NSLog("[AppDelegate] Failed to schedule BGAppRefreshTask: \(error)")
        }
    }

    private func handleBackgroundRefresh(task: BGAppRefreshTask) {
        // Always re-schedule the next refresh.
        scheduleBackgroundRefresh()

        NativeSyncDiagnostics.shared.recordBackgroundFetch()
        let group = DispatchGroup()
        var completed = false
        let completeOnce: (Bool) -> Void = { success in
            guard !completed else { return }
            completed = true
            task.setTaskCompleted(success: success)
        }

        group.enter()
        WearableSyncBridge.shared.fetchAndPersist { group.leave() }
        group.enter()
        AppleCalendarBackgroundSyncBridge.shared.fetchAndPersist { group.leave() }

        task.expirationHandler = {
            // iOS will kill us shortly — flag failure so it retries sooner.
            completeOnce(false)
        }

        group.notify(queue: .main) {
            completeOnce(true)
        }
    }

    private func startNetworkMonitor() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            guard let self = self else { return }
            let prev = self.lastPathStatus
            self.lastPathStatus = path.status
            // Only drain on the rising edge: previously not-satisfied → now satisfied.
            guard path.status == .satisfied, prev != .satisfied else { return }
            // Debounce: at most once per 10s.
            let now = Date().timeIntervalSince1970
            if now - self.lastReconnectDrainAt < 10 { return }
            self.lastReconnectDrainAt = now
            NSLog("[AppDelegate] Network reconnected — draining native outbox")
            NativeSyncDiagnostics.shared.recordReconnectDrain()
            WearableSyncBridge.shared.flushOutbox {}
            AppleCalendarBackgroundSyncBridge.shared.flushOutbox {}
        }
        networkMonitor.start(queue: networkMonitorQueue)
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
        if let notificationLogId = notification.request.content.userInfo["notification_log_id"] as? String,
           !notificationLogId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            NotificationReceiptClient.shared.recordReceipt(
                notificationLogId: notificationLogId,
                source: .foregroundSync
            )
        }
        if #available(iOS 14.0, *) {
            completionHandler([.banner, .list, .badge, .sound])
        } else {
            completionHandler([.alert, .badge, .sound])
        }
    }

    // MARK: - App Lifecycle

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {
        scheduleBackgroundRefresh()
    }

    func applicationWillEnterForeground(_ application: UIApplication) {
        // Drain any payloads that were queued while the app was backgrounded
        // or terminated. JS layer will also retry, but a native flush guarantees
        // we don't depend on the WebView being alive.
        NotificationReceiptClient.shared.flushPending()
        WearableSyncBridge.shared.flushOutbox {}
        AppleCalendarBackgroundSyncBridge.shared.flushOutbox {}
    }

    func applicationDidBecomeActive(_ application: UIApplication) {
        // Trigger a native Apple Calendar sync whenever the app becomes active.
        // EventKit and the backend are both idempotent, and the bridge itself
        // guards against duplicate in-flight syncs.
        AppleCalendarBackgroundSyncBridge.shared.fetchAndPersist {}
    }

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
