//
//  AppleCalendarBackgroundSyncBridge.swift
//  Mind Module
//
//  Native iOS background Apple Calendar sync.
//  Runs during iOS background fetch / manual native QA trigger. iOS controls
//  when background fetch is granted, so this is opportunistic rather than exact.
//

import Foundation
import EventKit
import Security

@objc public class AppleCalendarBackgroundSyncBridge: NSObject {
    public static let shared = AppleCalendarBackgroundSyncBridge()

    private let store = EKEventStore()
    private let supabaseProjectId = "iyilcpvercoywaweybpc"
    private var edgeFunctionURL: URL {
        return URL(string: "https://\(supabaseProjectId).supabase.co/functions/v1/sync-apple-calendar")!
    }

    private let tokenKey = "mindmodule.auth0_token"
    private let tokenExpiryKey = "mindmodule.auth0_token_expires_at"

    public func fetchAndPersist(done: @escaping () -> Void) {
        NativeSyncDiagnostics.shared.recordCalendarBackground()
        guard isCalendarAuthorized() else {
            NSLog("[AppleCalendarBackgroundSync] Calendar permission not granted — skipping")
            done()
            return
        }

        guard let token = readKeychain(key: tokenKey), !token.isEmpty else {
            NSLog("[AppleCalendarBackgroundSync] No auth token in Keychain — skipping")
            done()
            return
        }

        if let expiryRaw = readKeychain(key: tokenExpiryKey),
           let expiry = Double(expiryRaw),
           expiry < Date().timeIntervalSince1970 + 60 {
            NSLog("[AppleCalendarBackgroundSync] Auth token expired — skipping")
            done()
            return
        }

        let now = Date()
        let calendar = Calendar.current
        let start = calendar.date(byAdding: .day, value: -2, to: calendar.startOfDay(for: now)) ?? now
        var endComponents = DateComponents()
        endComponents.day = 8
        endComponents.hour = 23
        endComponents.minute = 59
        endComponents.second = 59
        let end = calendar.date(byAdding: endComponents, to: calendar.startOfDay(for: now)) ?? now

        let events = fetchEvents(start: start, end: end)
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        // Persist payload to native outbox FIRST so a process kill mid-upload never loses data.
        let payload: [String: Any] = [
            "windowStart": iso.string(from: start),
            "windowEnd": iso.string(from: end),
            "events": events,
            "source": "ios-background",
        ]
        if !events.isEmpty {
            NativeOutbox.shared.enqueue(provider: .appleCalendar, payload: payload)
        }
        drainOutbox(token: token, done: done)
    }

    @objc public func flushOutbox(done: @escaping () -> Void) {
        guard let token = readKeychain(key: tokenKey), !token.isEmpty else {
            NSLog("[AppleCalendarBackgroundSync] flushOutbox: no token — skipping")
            done()
            return
        }
        drainOutbox(token: token, done: done)
    }

    private func drainOutbox(token: String, done: @escaping () -> Void) {
        let items = NativeOutbox.shared.peek(provider: .appleCalendar)
        if items.isEmpty { done(); return }
        let group = DispatchGroup()
        for item in items {
            group.enter()
            postOutboxItem(item, token: token) { group.leave() }
        }
        group.notify(queue: .global(qos: .background)) { done() }
    }

    private func postOutboxItem(_ item: NativeOutbox.Item, token: String, done: @escaping () -> Void) {
        var request = URLRequest(url: edgeFunctionURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.setValue(item.id, forHTTPHeaderField: "X-Outbox-Item-Id")
        request.timeoutInterval = 30
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: item.payload)
        } catch {
            NativeOutbox.shared.markFailure(id: item.id, provider: .appleCalendar, error: "serialize: \(error.localizedDescription)")
            done(); return
        }
        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                NSLog("[AppleCalendarBackgroundSync] outbox POST failed: \(error.localizedDescription)")
                NativeOutbox.shared.markFailure(id: item.id, provider: .appleCalendar, error: error.localizedDescription)
                NativeSyncDiagnostics.shared.recordUploadError("apple-calendar: \(error.localizedDescription)")
                done(); return
            }
            if let http = response as? HTTPURLResponse {
                if (200..<300).contains(http.statusCode) {
                    NSLog("[AppleCalendarBackgroundSync] outbox POST ok: \(http.statusCode), item \(item.id)")
                    NativeOutbox.shared.remove(id: item.id, provider: .appleCalendar)
                    NativeSyncDiagnostics.shared.recordCalendarUpload()
                } else {
                    let msg = "http \(http.statusCode)"
                    NativeOutbox.shared.markFailure(id: item.id, provider: .appleCalendar, error: msg)
                    NativeSyncDiagnostics.shared.recordUploadError("apple-calendar: \(msg)")
                }
            }
            done()
        }
        task.resume()
    }

    private func isCalendarAuthorized() -> Bool {
        let status = EKEventStore.authorizationStatus(for: .event)
        if #available(iOS 17.0, *) {
            return status == .fullAccess || status == .authorized
        }
        return status == .authorized
    }

    private func fetchEvents(start: Date, end: Date) -> [[String: Any]] {
        let calendars = store.calendars(for: .event)
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        let events = store.events(matching: predicate)
        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]

        let normalized = events.map { ev -> [String: Any] in
            let attendees = ev.attendees ?? []
            let isOrganizer = ev.organizer?.isCurrentUser ?? false
            var metadata: [String: Any] = [
                "isAllDay": ev.isAllDay,
                "source": "ios-background",
            ]
            if let loc = ev.location { metadata["location"] = loc }
            if let cal = ev.calendar?.title { metadata["calendarTitle"] = cal }
            if let url = ev.url?.absoluteString { metadata["url"] = url }
            if let notes = ev.notes { metadata["notes"] = String(notes.prefix(500)) }

            return [
                "external_id": ev.eventIdentifier ?? "\(ev.calendarItemIdentifier)",
                "title": ev.title ?? "Untitled Event",
                "start_time": iso.string(from: ev.startDate),
                "end_time": iso.string(from: ev.endDate),
                "is_organizer": isOrganizer,
                "attendees_count": attendees.count,
                "is_recurring": ev.hasRecurrenceRules,
                "event_metadata": metadata,
            ]
        }

        NSLog("[AppleCalendarBackgroundSync] Read \(normalized.count) events")
        return normalized
    }

    private func postToEdgeFunction(events: [[String: Any]], windowStart: Date, windowEnd: Date, token: String, done: @escaping () -> Void) {
        var request = URLRequest(url: edgeFunctionURL)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        request.timeoutInterval = 30

        let iso = ISO8601DateFormatter()
        iso.formatOptions = [.withInternetDateTime]
        let payload: [String: Any] = [
            "windowStart": iso.string(from: windowStart),
            "windowEnd": iso.string(from: windowEnd),
            "events": events,
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        } catch {
            NSLog("[AppleCalendarBackgroundSync] JSON serialize failed: \(error.localizedDescription)")
            done()
            return
        }

        let task = URLSession.shared.dataTask(with: request) { _, response, error in
            if let error = error {
                NSLog("[AppleCalendarBackgroundSync] POST failed: \(error.localizedDescription)")
                done()
                return
            }
            if let http = response as? HTTPURLResponse {
                NSLog("[AppleCalendarBackgroundSync] POST status: \(http.statusCode), events: \(events.count)")
            }
            done()
        }
        task.resume()
    }

    private func readKeychain(key: String) -> String? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrAccount as String: key,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne,
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        guard status == errSecSuccess, let data = item as? Data else { return nil }
        return String(data: data, encoding: .utf8)
    }
}
