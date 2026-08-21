import Foundation

public final class NativeAuth0Refresher {
    private static let tokenKey = "mindmodule.auth0_token"
    private static let tokenExpiryKey = "mindmodule.auth0_token_expires_at"
    private static let refreshTokenKey = "mindmodule.auth0_refresh_token"
    private static let domainKey = "mindmodule.auth0_domain"
    private static let clientIdKey = "mindmodule.auth0_client_id"
    
    private static let refreshLock = NSLock()
    
    private static func readKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        if SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess,
           let data = item as? Data,
           let str = String(data: data, encoding: .utf8) {
            return str
        }
        return nil
    }
    
    private static func saveKeychain(key: String, value: String) throws {
        guard let data = value.data(using: .utf8) else { return }
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key
        ]
        SecItemDelete(query as CFDictionary)
        var attributes = query
        attributes[kSecValueData as String] = data
        attributes[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        SecItemAdd(attributes as CFDictionary, nil)
    }
    
    /// Synchronously fetches a fresh token if the current one is expired.
    /// Uses a lock to prevent concurrent refresh races (e.g. HealthKit + Calendar syncing simultaneously).
    public static func getValidAccessToken() -> String? {
        refreshLock.lock()
        defer { refreshLock.unlock() }
        
        guard let token = readKeychain(key: tokenKey), !token.isEmpty else { return nil }
        
        let now = Date().timeIntervalSince1970
        var isExpired = false
        if let expiryRaw = readKeychain(key: tokenExpiryKey), let expiry = Double(expiryRaw) {
            isExpired = expiry < (now + 60)
        }
        
        if !isExpired {
            return token // Still valid
        }
        
        // Try to refresh
        guard let refreshToken = readKeychain(key: refreshTokenKey),
              let domain = readKeychain(key: domainKey),
              let clientId = readKeychain(key: clientIdKey) else {
            NSLog("[NativeAuth0Refresher] Cannot refresh: missing refresh token or config")
            return nil
        }
        
        NSLog("[NativeAuth0Refresher] Access token expired. Attempting synchronous refresh.")
        
        guard let url = URL(string: "https://\(domain)/oauth/token") else { return nil }
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        let body: [String: String] = [
            "grant_type": "refresh_token",
            "client_id": clientId,
            "refresh_token": refreshToken
        ]
        req.httpBody = try? JSONSerialization.data(withJSONObject: body)
        
        let semaphore = DispatchSemaphore(value: 0)
        var newAccessToken: String? = nil
        
        let task = URLSession.shared.dataTask(with: req) { data, resp, err in
            defer { semaphore.signal() }
            if let err = err {
                NSLog("[NativeAuth0Refresher] Network error during refresh: \(err.localizedDescription)")
                return
            }
            guard let data = data, let http = resp as? HTTPURLResponse, http.statusCode == 200 else {
                NSLog("[NativeAuth0Refresher] Refresh failed with non-200 status")
                return
            }
            guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let access = json["access_token"] as? String else {
                return
            }
            newAccessToken = access
            
            // Save the new token
            try? saveKeychain(key: tokenKey, value: access)
            if let expiresIn = json["expires_in"] as? Double {
                try? saveKeychain(key: tokenExpiryKey, value: String(Int(now + expiresIn)))
            }
            if let newRefresh = json["refresh_token"] as? String {
                try? saveKeychain(key: refreshTokenKey, value: newRefresh)
            }
            
            // Hydrate the memory provider
            SupabaseAuthTokenProvider.shared.updateToken(access)
        }
        task.resume()
        _ = semaphore.wait(timeout: .now() + 10.0)
        
        return newAccessToken
    }
}
