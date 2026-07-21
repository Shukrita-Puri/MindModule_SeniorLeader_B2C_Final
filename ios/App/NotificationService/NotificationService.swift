import UserNotifications

final class NotificationService: UNNotificationServiceExtension {
    private var contentHandler: ((UNNotificationContent) -> Void)?
    private var bestAttemptContent: UNMutableNotificationContent?

    override func didReceive(
        _ request: UNNotificationRequest,
        withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
    ) {
        self.contentHandler = contentHandler
        bestAttemptContent = (request.content.mutableCopy() as? UNMutableNotificationContent)

        if let notificationLogId = request.content.userInfo["notification_log_id"] as? String,
           !notificationLogId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            NotificationReceiptClient.shared.recordReceipt(
                notificationLogId: notificationLogId,
                source: .nse
            )
        }

        finish(with: bestAttemptContent ?? UNMutableNotificationContent())
    }

    override func serviceExtensionTimeWillExpire() {
        finish(with: bestAttemptContent ?? UNMutableNotificationContent())
    }

    private func finish(with content: UNNotificationContent) {
        let handler = contentHandler
        contentHandler = nil
        handler?(content)
    }
}
