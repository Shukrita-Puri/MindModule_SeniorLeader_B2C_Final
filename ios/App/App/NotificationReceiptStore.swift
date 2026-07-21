import Foundation

enum NotificationReceiptSource: String, Codable {
    case nse
    case foregroundSync = "foreground_sync"
    case tap
}

struct PendingNotificationReceipt: Codable {
    let notificationLogId: String
    let receivedAt: String
    let source: NotificationReceiptSource

    init(notificationLogId: String, receivedAt: String, source: NotificationReceiptSource) {
        self.notificationLogId = notificationLogId
        self.receivedAt = receivedAt
        self.source = source
    }
}

final class NotificationReceiptStore {
    static let shared = NotificationReceiptStore()

    static let appGroupSuiteName = "group.com.moonshot.mindmoduleapp.shared"

    private let defaults = UserDefaults(suiteName: appGroupSuiteName) ?? .standard
    private let queue = DispatchQueue(label: "mindmodule.notificationReceiptStore")
    private let pendingReceiptsKey = "mindmodule.notification.pendingReceipts"
    private let isoFormatter = ISO8601DateFormatter()

    private init() {}

    func enqueue(notificationLogId: String, receivedAt: Date = Date(), source: NotificationReceiptSource) {
        let trimmedId = notificationLogId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedId.isEmpty else { return }

        queue.sync {
            var all = loadLocked()
            let incoming = PendingNotificationReceipt(
                notificationLogId: trimmedId,
                receivedAt: isoFormatter.string(from: receivedAt),
                source: source
            )
            if let existingIndex = all.firstIndex(where: { $0.notificationLogId == trimmedId }) {
                all[existingIndex] = merge(existing: all[existingIndex], incoming: incoming)
            } else {
                all.append(incoming)
            }
            saveLocked(all)
        }
    }

    func snapshot() -> [PendingNotificationReceipt] {
        queue.sync { loadLocked() }
    }

    func remove(notificationLogIds: [String]) {
        let idSet = Set(notificationLogIds.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty })
        guard !idSet.isEmpty else { return }

        queue.sync {
            let next = loadLocked().filter { !idSet.contains($0.notificationLogId) }
            saveLocked(next)
        }
    }

    private func loadLocked() -> [PendingNotificationReceipt] {
        guard let data = defaults.data(forKey: pendingReceiptsKey) else { return [] }
        return (try? JSONDecoder().decode([PendingNotificationReceipt].self, from: data)) ?? []
    }

    private func saveLocked(_ receipts: [PendingNotificationReceipt]) {
        guard let data = try? JSONEncoder().encode(receipts) else { return }
        defaults.set(data, forKey: pendingReceiptsKey)
    }

    private func merge(existing: PendingNotificationReceipt, incoming: PendingNotificationReceipt) -> PendingNotificationReceipt {
        let existingDate = isoFormatter.date(from: existing.receivedAt) ?? .distantFuture
        let incomingDate = isoFormatter.date(from: incoming.receivedAt) ?? .distantFuture
        let earliest = existingDate <= incomingDate ? existing : incoming
        let strongestSource = sourcePriority(existing.source) >= sourcePriority(incoming.source)
            ? existing.source
            : incoming.source

        return PendingNotificationReceipt(
            notificationLogId: existing.notificationLogId,
            receivedAt: earliest.receivedAt,
            source: strongestSource
        )
    }

    private func sourcePriority(_ source: NotificationReceiptSource) -> Int {
        switch source {
        case .nse:
            return 3
        case .tap:
            return 2
        case .foregroundSync:
            return 1
        }
    }
}
