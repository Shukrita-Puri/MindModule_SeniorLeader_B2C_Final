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
            var metadata: [String: Any] = [
                "isAllDay": ev.isAllDay,
            ]
            if let loc = ev.location { metadata["location"] = loc }
            if let cal = ev.calendar?.title { metadata["calendarTitle"] = cal }
            if let url = ev.url?.absoluteString { metadata["url"] = url }
            if let notes = ev.notes { metadata["notes"] = String(notes.prefix(500)) }
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
            @unknown default: return "unknown"
            }
        }
    }
}