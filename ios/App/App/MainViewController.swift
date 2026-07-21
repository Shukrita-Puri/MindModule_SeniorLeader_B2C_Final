import Capacitor

class MainViewController: CAPBridgeViewController {
    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(AppleCalendarPlugin())
        bridge?.registerPluginInstance(NativeBackgroundSyncPlugin())
        bridge?.registerPluginInstance(NotificationAuthorizationPlugin())
        bridge?.registerPluginInstance(LocationBridgePlugin())
    }
}
