//
//  AppleCalendarBridge.swift
//  Mind Module
//
//  Native iOS Apple Calendar (EventKit) access exposed to JS via Capacitor.
//  - Requests EventKit permission (iOS 17+ full access, iOS 16 fallback).
//  - Returns events in a normalized shape matching the calendar_events schema.
//

import Foundation
import Capacitor
import EventKit

@objc(AppleCalendarPlugin)
public class AppleCalendarPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "AppleCalendarPlugin"
    public let jsName = "AppleCalendar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "requestPermission", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getPermissionStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "fetchEvents", returnType: CAPPluginReturnPromise),
    ]

    private let store = EKEventStore()
    private let isoFormatter: ISO8601DateFormatter = {
        let f = ISO8601DateFormatter()
        f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return f
    }()

    private func participantStatusLabel(_ status: EKParticipantStatus) -> String {
        switch status {
        case .unknown: return "unknown"
        case .pending: return "pending"
        case .accepted: return "accepted"
        case .declined: return "declined"
        case .tentative: return "tentative"
        case .delegated: return "delegated"
        @unknown default: return "unknown"
        }
    }

    private func participantSummary(_ participant: EKParticipant) -> [String: Any] {
        let contactUrl = participant.url?.absoluteString ?? ""
        let email: String = {
            let s = contactUrl.lowercased()
            if s.hasPrefix("mailto:") {
                let candidate = String(s.dropFirst(7))
                if candidate.contains("@") { return candidate }
            }
            return ""
        }()
        let emailDomain: String = {
            if let at = email.firstIndex(of: "@") {
                return String(email[email.index(after: at)...])
            }
            return ""
        }()
        var summary: [String: Any] = [
            "displayName": participant.name ?? "",
            "contactUrl": participant.url?.absoluteString ?? "",
            "email": email,
            "emailDomain": emailDomain,
            "responseStatus": participantStatusLabel(participant.participantStatus),
            "isSelf": participant.isCurrentUser,
        ]
        summary["isOrganizer"] = participant.participantRole == .organizer
        return summary
    }

    // EKEventStoreChanged observer: when the user adds/edits/deletes events in
    // any app on the device (Apple Calendar, iCloud subscriptions, etc.), we
    // notify JS so the in-app UI can re-sync and re-render immediately —
    // instead of waiting for the 6-hour stale window.
    private var jsChangeObserver: NSObjectProtocol?

    override public func load() {
        super.load()
        if jsChangeObserver == nil {
            jsChangeObserver = NotificationCenter.default.addObserver(
                forName: .EKEventStoreChanged,
                object: nil,
                queue: .main
            ) { [weak self] _ in
                guard let self = self else { return }
                NSLog("[AppleCalendarPlugin] EKEventStoreChanged — notifying JS")
                self.notifyListeners("calendarStoreChanged", data: [
                    "at": Date().timeIntervalSince1970 * 1000
                ])
            }
        }
    }

    deinit {
        if let obs = jsChangeObserver {
            NotificationCenter.default.removeObserver(obs)
        }
    }

    @objc func getPermissionStatus(_ call: CAPPluginCall) {
        let status = EKEventStore.authorizationStatus(for: .event)
        call.resolve(["status": label(for: status)])
    }

    @objc func requestPermission(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            store.requestFullAccessToEvents { granted, error in
                if let error = error {
                    call.reject("EventKit permission error: \(error.localizedDescription)")
                    return
                }
                call.resolve(["granted": granted, "status": granted ? "fullAccess" : "denied"])
            }
        } else {
            store.requestAccess(to: .event) { granted, error in
                if let error = error {
                    call.reject("EventKit permission error: \(error.localizedDescription)")
                    return
                }
                call.resolve(["granted": granted, "status": granted ? "authorized" : "denied"])
            }
        }
    }

    @objc func fetchEvents(_ call: CAPPluginCall) {
        guard let startISO = call.getString("startISO"),
              let endISO = call.getString("endISO"),
              let start = isoFormatter.date(from: startISO) ?? ISO8601DateFormatter().date(from: startISO),
              let end = isoFormatter.date(from: endISO) ?? ISO8601DateFormatter().date(from: endISO) else {
            call.reject("Missing or invalid startISO/endISO")
            return
        }

        // Verify permission
        let status = EKEventStore.authorizationStatus(for: .event)
        let authorized: Bool
        if #available(iOS 17.0, *) {
            authorized = (status == .fullAccess || status == .authorized)
        } else {
            authorized = (status == .authorized)
        }
        if !authorized {
            call.reject("Calendar permission not granted")
            return
        }

        let calendars = store.calendars(for: .event)
        let predicate = store.predicateForEvents(withStart: start, end: end, calendars: calendars)
        let events = store.events(matching: predicate)

        let outIso = ISO8601DateFormatter()
        outIso.formatOptions = [.withInternetDateTime]

        let normalized: [[String: Any]] = events.map { ev in
            let attendees = ev.attendees ?? []
            let isOrganizer = ev.organizer?.isCurrentUser ?? false
            let organizerContactUrl = ev.organizer?.url?.absoluteString ?? ""
            let organizerEmail: String = {
                let s = organizerContactUrl.lowercased()
                if s.hasPrefix("mailto:") {
                    let c = String(s.dropFirst(7))
                    if c.contains("@") { return c }
                }
                return ""
            }()
            let organizerEmailDomain: String = {
                if let at = organizerEmail.firstIndex(of: "@") {
                    return String(organizerEmail[organizerEmail.index(after: at)...])
                }
                return ""
            }()
            let attendeeSignals: [String: Any] = [
                "organizer": [
                    "displayName": ev.organizer?.name ?? "",
                    "contactUrl": ev.organizer?.url?.absoluteString ?? "",
                    "email": organizerEmail,
                    "emailDomain": organizerEmailDomain,
                    "isCurrentUser": isOrganizer,
                ],
                "attendees": attendees.map { participantSummary($0) },
                "attendeeCount": attendees.count,
            ]
            var metadata: [String: Any] = [
                "isAllDay": ev.isAllDay,
            ]
            if let loc = ev.location { metadata["location"] = loc }
            if let cal = ev.calendar?.title { metadata["calendarTitle"] = cal }
            if let url = ev.url?.absoluteString {
                metadata["url"] = url
                metadata["meetingUrl"] = url
            }
            if let notes = ev.notes { metadata["notes"] = String(notes.prefix(500)) }
            if let notes = ev.notes { metadata["description"] = String(notes.prefix(500)) }
            if ev.hasRecurrenceRules, let rule = ev.recurrenceRules?.first {
                metadata["recurrence"] = [
                    "frequency": "\(rule.frequency.rawValue)",
                    "interval": rule.interval,
                ]
            }
            metadata["attendeeSignals"] = attendeeSignals
            return [
                "external_id": ev.eventIdentifier ?? "\(ev.calendarItemIdentifier)",
                "title": ev.title ?? "Untitled Event",
                "start_time": outIso.string(from: ev.startDate),
                "end_time": outIso.string(from: ev.endDate),
                "is_organizer": isOrganizer,
                "attendees_count": attendees.count,
                "is_recurring": ev.hasRecurrenceRules,
                "event_metadata": metadata,
            ]
        }

        call.resolve(["events": normalized])
    }

    private func label(for status: EKAuthorizationStatus) -> String {
        if #available(iOS 17.0, *) {
            switch status {
            case .notDetermined: return "notDetermined"
            case .restricted: return "restricted"
            case .denied: return "denied"
            case .fullAccess: return "fullAccess"
            case .writeOnly: return "writeOnly"
            case .authorized: return "authorized"
            @unknown default: return "unknown"
            }
        } else {
            switch status {
            case .notDetermined: return "notDetermined"
            case .restricted: return "restricted"
            case .denied: return "denied"
            case .authorized: return "authorized"
            default: return "unknown"
            }
        }
    }
}
