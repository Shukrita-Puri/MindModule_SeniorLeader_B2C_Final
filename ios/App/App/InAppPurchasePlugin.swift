import Foundation
import Capacitor
import StoreKit

/**
 * StoreKit 2 bridge for Apple In-App Purchase (App Store Review Guideline 3.1.1).
 *
 * Responsibilities:
 *  - load products from the App Store (never hardcode prices)
 *  - run the purchase flow and return the signed JWS transaction
 *  - restore purchases / report current entitlements
 *  - listen for out-of-band transaction updates (renewals, Ask to Buy,
 *    interrupted purchases) and forward them to the web layer
 *
 * The signed JWS payload is verified SERVER-SIDE by the `verify-apple-purchase`
 * edge function. This plugin never grants entitlement on its own.
 */
@available(iOS 15.0, *)
@objc(InAppPurchasePlugin)
public class InAppPurchasePlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "InAppPurchasePlugin"
    public let jsName = "InAppPurchase"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getProducts", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getCurrentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "openManageSubscriptions", returnType: CAPPluginReturnPromise),
    ]

    private var updateListener: Task<Void, Never>?

    override public func load() {
        // Transactions can arrive while the app is backgrounded (renewals,
        // Ask to Buy approvals, purchases interrupted mid-flow). Forward them
        // so the web layer can re-verify server-side.
        updateListener = Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard let self = self else { return }
                if case .verified(let transaction) = result {
                    await transaction.finish()
                    self.notifyListeners("transactionUpdated", data: [
                        "productId": transaction.productID,
                        "transactionId": String(transaction.id),
                        "originalTransactionId": String(transaction.originalID),
                    ])
                }
            }
        }
    }

    deinit {
        updateListener?.cancel()
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        call.resolve(["available": AppStore.canMakePayments])
    }

    @objc func getProducts(_ call: CAPPluginCall) {
        guard let ids = call.getArray("productIds", String.self), !ids.isEmpty else {
            call.reject("productIds required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: ids)
                var payload: [[String: Any]] = []
                for product in products {
                    var entry: [String: Any] = [
                        "id": product.id,
                        "title": product.displayName,
                        "description": product.description,
                        "displayPrice": product.displayPrice,
                        "price": NSDecimalNumber(decimal: product.price).doubleValue,
                        "currencyCode": product.priceFormatStyle.currencyCode,
                    ]
                    if let sub = product.subscription {
                        entry["periodUnit"] = self.periodLabel(sub.subscriptionPeriod.unit)
                        entry["periodValue"] = sub.subscriptionPeriod.value
                        // Apple decides eligibility per Apple ID / subscription group.
                        // A returned introductoryOffer alone is NOT proof the *current*
                        // user can take it, so we ask StoreKit explicitly.
                        let eligible = await sub.isEligibleForIntroOffer
                        entry["isEligibleForIntroOffer"] = eligible
                        // Only advertise an intro offer if Apple returns one AND the
                        // signed-in Apple ID is eligible for it.
                        if let intro = sub.introductoryOffer, eligible {
                            entry["introOffer"] = [
                                "displayPrice": intro.displayPrice,
                                "paymentMode": self.paymentModeLabel(intro.paymentMode),
                                "periodUnit": self.periodLabel(intro.period.unit),
                                "periodValue": intro.period.value,
                                "periodCount": intro.periodCount,
                            ]
                        }
                    }
                    payload.append(entry)
                }
                // Diagnostics only — product ids, counts and storefront country.
                // Never receipts, transactions, tokens or Apple account identity.
                let returnedIds = products.map { $0.id }
                let missingIds = ids.filter { !returnedIds.contains($0) }
                let storefront = await Storefront.current?.countryCode
                if !missingIds.isEmpty {
                    CAPLog.print("[InAppPurchase] StoreKit did not return: \(missingIds.joined(separator: ", ")) (requested: \(ids.joined(separator: ", ")), storefront: \(storefront ?? "unknown"))")
                }
                call.resolve([
                    "products": payload,
                    "requestedProductIds": ids,
                    "missingProductIds": missingIds,
                    "storefront": storefront ?? NSNull(),
                    "locale": Locale.current.identifier,
                ])
            } catch {
                let nsError = error as NSError
                CAPLog.print("[InAppPurchase] getProducts failed: domain=\(nsError.domain) code=\(nsError.code) requested=\(ids.joined(separator: ", "))")
                call.reject(
                    "Failed to load products: \(error.localizedDescription)",
                    "\(nsError.domain).\(nsError.code)",
                    error
                )
            }
        }
    }

    @objc func purchase(_ call: CAPPluginCall) {
        guard let productId = call.getString("productId") else {
            call.reject("productId required")
            return
        }
        guard let appAccountToken = call.getString("appAccountToken").flatMap(UUID.init(uuidString:)) else {
            call.reject("appAccountToken (uuid) required")
            return
        }
        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first else {
                    call.reject("Unknown product: \(productId)")
                    return
                }
                let result = try await product.purchase(options: [.appAccountToken(appAccountToken)])
                switch result {
                case .success(let verification):
                    switch verification {
                    case .verified(let transaction):
                        await transaction.finish()
                        call.resolve([
                            "status": "purchased",
                            "productId": transaction.productID,
                            "transactionId": String(transaction.id),
                            "originalTransactionId": String(transaction.originalID),
                            "signedTransaction": verification.jwsRepresentation,
                        ])
                    case .unverified(_, let error):
                        call.resolve([
                            "status": "failed",
                            "message": "Unverified transaction: \(error.localizedDescription)",
                        ])
                    }
                case .userCancelled:
                    call.resolve(["status": "cancelled"])
                case .pending:
                    // Ask to Buy / SCA — entitlement arrives later via Transaction.updates
                    call.resolve(["status": "pending"])
                @unknown default:
                    call.resolve(["status": "failed", "message": "Unknown purchase result"])
                }
            } catch {
                call.resolve(["status": "failed", "message": error.localizedDescription])
            }
        }
    }

    @objc func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
            } catch {
                // Sync can fail if the user cancels the sign-in sheet; fall
                // through and still report whatever entitlements we can read.
                CAPLog.print("[InAppPurchase] AppStore.sync failed: \(error.localizedDescription)")
            }
            let entitlements = await self.currentEntitlementPayload()
            call.resolve(["entitlements": entitlements])
        }
    }

    @objc func getCurrentEntitlements(_ call: CAPPluginCall) {
        Task {
            let entitlements = await self.currentEntitlementPayload()
            call.resolve(["entitlements": entitlements])
        }
    }

    @objc func openManageSubscriptions(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard let scene = self.bridge?.viewController?.view.window?.windowScene else {
                call.resolve(["opened": false])
                return
            }
            do {
                try await AppStore.showManageSubscriptions(in: scene)
                call.resolve(["opened": true])
            } catch {
                call.resolve(["opened": false, "message": error.localizedDescription])
            }
        }
    }

    private func currentEntitlementPayload() async -> [[String: Any]] {
        var payload: [[String: Any]] = []
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            payload.append([
                "productId": transaction.productID,
                "transactionId": String(transaction.id),
                "originalTransactionId": String(transaction.originalID),
                "signedTransaction": result.jwsRepresentation,
            ])
        }
        return payload
    }

    private func periodLabel(_ unit: Product.SubscriptionPeriod.Unit) -> String {
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return "unknown"
        }
    }

    /// Stable, parseable payment-mode strings for the web layer.
    /// `freeTrial` is what drives the "7-day free trial" paywall copy.
    private func paymentModeLabel(_ mode: Product.SubscriptionOffer.PaymentMode) -> String {
        switch mode {
        case .freeTrial: return "freeTrial"
        case .payAsYouGo: return "payAsYouGo"
        case .payUpFront: return "payUpFront"
        default: return "unknown"
        }
    }
}