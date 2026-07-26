import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AppleCalendarPlugin())
        bridge?.registerPluginInstance(NativeBackgroundSyncPlugin())
        bridge?.registerPluginInstance(NotificationAuthorizationPlugin())
        bridge?.registerPluginInstance(LocationBridgePlugin())
        // Apple In-App Purchase (StoreKit 2) — required on iOS/iPadOS for all
        // subscription purchases (App Store Review Guideline 3.1.1).
        if #available(iOS 15.0, *) {
            bridge?.registerPluginInstance(InAppPurchasePlugin())
        }
    }
}
