import Foundation

@objc public class BackgroundUploadManager: NSObject, URLSessionTaskDelegate, URLSessionDataDelegate {
    public static let shared = BackgroundUploadManager()
    
    private var session: URLSession!
    private var completionHandler: (() -> Void)?
    
    // Map taskIdentifier -> [ "id": outboxId, "provider": providerString ]
    private let kTaskMapKey = "mm.backgroundUpload.taskMap"
    private var taskMap: [String: [String: String]] {
        get { UserDefaults.standard.dictionary(forKey: kTaskMapKey) as? [String: [String: String]] ?? [:] }
        set { UserDefaults.standard.set(newValue, forKey: kTaskMapKey) }
    }
    
    // In-memory accumulator for chunked responses
    private var responseDataMap: [Int: Data] = [:]
    
    private override init() {
        super.init()
        let config = URLSessionConfiguration.background(withIdentifier: "me.mindmodule.background-upload")
        config.sessionSendsLaunchEvents = true
        config.isDiscretionary = false // We want it to run as soon as possible, even in background
        self.session = URLSession(configuration: config, delegate: self, delegateQueue: nil)
    }
    
    public func setCompletionHandler(_ handler: @escaping () -> Void) {
        self.completionHandler = handler
    }
    
    public func enqueueUpload(item: NativeOutbox.Item, provider: NativeOutbox.Provider, request: URLRequest) {
        // Write payload to a temp file because background sessions require uploadTask(with:fromFile:)
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("\(UUID().uuidString).json")
        
        do {
            let data = try JSONSerialization.data(withJSONObject: item.payload, options: [])
            try data.write(to: fileURL)
            
            var uploadReq = request
            uploadReq.httpMethod = "POST"
            uploadReq.setValue("application/json", forHTTPHeaderField: "Content-Type")
            
            let task = session.uploadTask(with: uploadReq, fromFile: fileURL)
            
            var currentMap = self.taskMap
            currentMap[String(task.taskIdentifier)] = [
                "id": item.id,
                "provider": provider.rawValue,
                "file": fileURL.path
            ]
            self.taskMap = currentMap
            
            task.resume()
            NSLog("[BackgroundUploadManager] Enqueued background upload task \(task.taskIdentifier) for item \(item.id)")
        } catch {
            NSLog("[BackgroundUploadManager] Failed to write temp file for background upload: \(error)")
            NativeOutbox.shared.markFailure(id: item.id, provider: provider, error: "Failed to write temp file")
        }
    }
    
    public func urlSession(_ session: URLSession, dataTask: URLSessionDataTask, didReceive data: Data) {
        // Accumulate chunked response data
        if responseDataMap[dataTask.taskIdentifier] == nil {
            responseDataMap[dataTask.taskIdentifier] = data
        } else {
            responseDataMap[dataTask.taskIdentifier]?.append(data)
        }
    }
    
    public func urlSession(_ session: URLSession, task: URLSessionTask, didCompleteWithError error: Error?) {
        guard let taskInfo = taskMap[String(task.taskIdentifier)],
              let id = taskInfo["id"],
              let providerRaw = taskInfo["provider"],
              let provider = NativeOutbox.Provider(rawValue: providerRaw) else { return }
              
        // Parse any accumulated data
        var partial = false
        if provider == .appleHealth,
           let accumulatedData = responseDataMap[task.taskIdentifier],
           let json = (try? JSONSerialization.jsonObject(with: accumulatedData)) as? [String: Any],
           let p = json["partial"] as? Bool, p {
            NSLog("[BackgroundUploadManager] Server returned partial: true for task \(task.taskIdentifier)")
            partial = true
        }
        
        // Clean up accumulator and temp file
        responseDataMap.removeValue(forKey: task.taskIdentifier)
        if let filePath = taskInfo["file"] {
            try? FileManager.default.removeItem(atPath: filePath)
        }
        
        // Remove from map
        var currentMap = self.taskMap
        currentMap.removeValue(forKey: String(task.taskIdentifier))
        self.taskMap = currentMap
        
        if let error = error {
            NSLog("[BackgroundUploadManager] Task \(task.taskIdentifier) failed: \(error)")
            NativeOutbox.shared.markFailure(id: id, provider: provider, error: error.localizedDescription)
            NativeSyncDiagnostics.shared.recordUploadError("\(providerRaw): \(error.localizedDescription)")
            return
        }
        
        guard let http = task.response as? HTTPURLResponse else {
            NativeOutbox.shared.markFailure(id: id, provider: provider, error: "No HTTP response")
            return
        }
        
        if (200..<300).contains(http.statusCode) {
            if partial {
                NativeOutbox.shared.markFailure(id: id, provider: provider, error: "Partial success, requeued")
            } else {
                NSLog("[BackgroundUploadManager] Task \(task.taskIdentifier) succeeded.")
                NativeOutbox.shared.remove(id: id, provider: provider)
                
                if provider == .appleHealth {
                    NativeSyncDiagnostics.shared.recordHealthUpload()
                } else if provider == .appleCalendar {
                    NativeSyncDiagnostics.shared.recordCalendarUpload()
                }
            }
        } else {
            NativeOutbox.shared.markFailure(id: id, provider: provider, error: "HTTP \(http.statusCode)")
            NativeSyncDiagnostics.shared.recordUploadError("\(providerRaw): HTTP \(http.statusCode)")
        }
    }
    
    public func urlSessionDidFinishEvents(forBackgroundURLSession session: URLSession) {
        DispatchQueue.main.async {
            self.completionHandler?()
            self.completionHandler = nil
        }
    }
}
