// WearableStatusWriter
//
// Sole caller of the native-authoritative wearable-status-update
// edge function. Never emits the legacy internal marker string
// `native_healthkit_fallback_triggered` — that identifier is
// telemetry-only.
//
// The writer is fire-and-forget from the caller's perspective; it
// enqueues in the network layer and reports success/failure via the
// completion. It does NOT retry — HealthKitSyncManager reruns the
// classification on the next tick if a network error occurs.

import Foundation

public enum AuthoritativeWatchStatus: String {
    case synced
    case waitingForData = "waiting_for_data"
    case syncDelayed = "sync_delayed"
    case permissionRevoked = "permission_revoked"
    case error
}

public final class WearableStatusWriter {
    public static let shared = WearableStatusWriter()

    private let session: URLSession
    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    public init(session: URLSession = .shared) {
        self.session = session
    }

    public struct Result {
        public let applied: Bool
        public let reason: String?
    }

    public func write(
        status: AuthoritativeWatchStatus,
        authoritativeAt: Date = Date(),
        errorCode: String? = nil,
        lastSampleAt: Date? = nil,
        counts: [String: Int]? = nil,
        completion: @escaping (Result?) -> Void
    ) {
        guard let url = endpointURL(),
              let token = SupabaseAuthTokenProvider.shared.currentToken() else {
            NSLog("[WearableStatusWriter] missing endpoint or token — skipping write")
            completion(nil)
            return
        }

        var body: [String: Any] = [
            "status": status.rawValue,
            "source": "native-ios",
            "authoritativeAt": isoFormatter.string(from: authoritativeAt),
        ]
        if let ec = errorCode, !ec.isEmpty, ec != "native_healthkit_fallback_triggered" {
            body["errorCode"] = ec
        }
        if let last = lastSampleAt { body["lastSampleAt"] = isoFormatter.string(from: last) }
        if let counts = counts { body["counts"] = counts }

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)

        session.dataTask(with: req) { data, response, err in
            if let err = err {
                NSLog("[WearableStatusWriter] transport error: \(err.localizedDescription)")
                completion(nil)
                return
            }
            guard let http = response as? HTTPURLResponse, (200...299).contains(http.statusCode) else {
                NSLog("[WearableStatusWriter] non-2xx response")
                completion(nil)
                return
            }
            let json = (try? JSONSerialization.jsonObject(with: data ?? Data())) as? [String: Any]
            let applied = (json?["applied"] as? Bool) ?? false
            let reason = json?["reason"] as? String
            completion(Result(applied: applied, reason: reason))
        }.resume()
    }

    private func endpointURL() -> URL? {
        // The NativeBackgroundSync bridge and existing writers rely on
        // a bundled SUPABASE_URL constant. Reuse the same source so we
        // stay in lock-step with the JS layer.
        guard let base = SupabaseAuthTokenProvider.shared.supabaseURL() else { return nil }
        return URL(string: "\(base)/functions/v1/wearable-status-update")
    }
}

// MARK: - Auth token bridge
//
// The existing NativeBackgroundSyncPlugin already receives the
// Supabase access token from JS via updateAuthToken(). We expose a
// tiny shared holder here so WearableStatusWriter (and future native
// writers) can read it without depending on the plugin type.

public final class SupabaseAuthTokenProvider {
    public static let shared = SupabaseAuthTokenProvider()
    private let lock = NSLock()
    private var token: String?
    private var baseURL: String?

    public func updateToken(_ token: String?) {
        lock.lock(); defer { lock.unlock() }
        self.token = token
    }

    public func updateSupabaseURL(_ url: String) {
        lock.lock(); defer { lock.unlock() }
        self.baseURL = url
    }

    public func currentToken() -> String? {
        lock.lock(); defer { lock.unlock() }
        return token
    }

    public func supabaseURL() -> String? {
        lock.lock(); defer { lock.unlock() }
        return baseURL
    }
}