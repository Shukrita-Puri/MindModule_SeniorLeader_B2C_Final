import Foundation

final class NotificationReceiptClient {
    static let shared = NotificationReceiptClient()

    private let session = URLSession(configuration: .ephemeral)
    private let store = NotificationReceiptStore.shared
    private let supabaseProjectId = "iyilcpvercoywaweybpc"

    private init() {}

    func recordReceipt(
        notificationLogId: String,
        source: NotificationReceiptSource,
        receivedAt: Date = Date(),
        completion: ((Bool) -> Void)? = nil
    ) {
        store.enqueue(notificationLogId: notificationLogId, receivedAt: receivedAt, source: source)
        flushPending(completion: completion)
    }

    func flushPending(completion: ((Bool) -> Void)? = nil) {
        let pending = store.snapshot()
        guard !pending.isEmpty else {
            completion?(true)
            return
        }

        guard let url = URL(string: "https://\(supabaseProjectId).supabase.co/functions/v1/notification-receipt") else {
            completion?(false)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.timeoutInterval = 10

        let payload: [String: Any] = [
            "receipts": pending.map { receipt in
                [
                    "notification_log_id": receipt.notificationLogId,
                    "received_at": receipt.receivedAt,
                    "source": receipt.source.rawValue,
                ]
            },
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload, options: [])
        } catch {
            completion?(false)
            return
        }

        session.dataTask(with: request) { [store] data, response, error in
            if let error = error {
                NSLog("[NotificationReceipt] Flush failed: \(error.localizedDescription)")
                completion?(false)
                return
            }

            guard let http = response as? HTTPURLResponse else {
                completion?(false)
                return
            }

            guard (200..<300).contains(http.statusCode) else {
                let body = data.flatMap { String(data: $0, encoding: .utf8) } ?? ""
                NSLog("[NotificationReceipt] Flush rejected: status=\(http.statusCode) body=\(body)")
                completion?(false)
                return
            }

            store.remove(notificationLogIds: pending.map(\.notificationLogId))
            completion?(true)
        }.resume()
    }
}
