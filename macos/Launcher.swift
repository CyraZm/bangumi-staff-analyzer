import AppKit
import Foundation
import Darwin

// A small native lifecycle owner; the interface stays in the user's usual browser.
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let base = URL(string: "http://localhost:8000")!
    private let bundleID = "tv.bangumi.staff-analyzer"
    private var server: Process?
    private var errorPipe: Pipe?
    private var sessionToken: String?
    private var sessionInstance: String?
    private var ready = false
    private var exiting = false
    private var monitor: Timer?
    private var startupDeadline = Date()
    private let http: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.timeoutIntervalForRequest = 1
        config.connectionProxyDictionary = [:]
        return URLSession(configuration: config)
    }()

    func applicationDidFinishLaunching(_ notification: Notification) {
        buildMenu()
        // Also cover direct execution of the app executable, outside Launch Services.
        if let existing = NSRunningApplication.runningApplications(withBundleIdentifier: bundleID)
            .first(where: { $0.processIdentifier != getpid() && !$0.isTerminated }) {
            existing.activate(options: [])
            openBrowser()
            NSApp.terminate(nil)
            return
        }
        health { info in
            if let info = info {
                guard info["version"] as? String == "1.5.0" else {
                    self.fail("另一个版本仍在运行", "请先在旧页面点击「关闭应用」，然后重新打开 Staff Analyzer。")
                    return
                }
                self.accept(info)
                self.startMonitor()
            } else {
                self.startServer()
            }
        }
    }

    private func buildMenu() {
        let menu = NSMenu()
        let item = NSMenuItem()
        menu.addItem(item)
        let appMenu = NSMenu()
        let show = NSMenuItem(title: "打开 Staff Analyzer", action: #selector(openBrowser), keyEquivalent: "o")
        show.target = self
        appMenu.addItem(show)
        appMenu.addItem(.separator())
        let quit = NSMenuItem(title: "退出 Staff Analyzer", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        appMenu.addItem(quit)
        item.submenu = appMenu
        NSApp.mainMenu = menu
    }

    @objc private func openBrowser() {
        NSWorkspace.shared.open(base)
    }

    private func health(_ completion: @escaping ([String: Any]?) -> Void) {
        var request = URLRequest(url: base.appendingPathComponent("__app/status"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        http.dataTask(with: request) { data, response, _ in
            var info: [String: Any]?
            if let response = response as? HTTPURLResponse, response.statusCode == 200,
               let data = data, data.count < 4096,
               let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               object["app"] as? String == "bangumi-staff-analyzer",
               object["token"] is String, object["instance"] is String {
                info = object
            }
            let result = info
            DispatchQueue.main.async { if !self.exiting { completion(result) } }
        }.resume()
    }

    private func startServer() {
        let candidates = ["/opt/homebrew/bin/python3", "/usr/local/bin/python3", "/usr/bin/python3"]
        guard let python = candidates.first(where: { FileManager.default.isExecutableFile(atPath: $0) }),
              let resources = Bundle.main.resourceURL else {
            fail("找不到 Python 3", "本机需要 Python 3 才能启动本地服务。安装后再双击此应用即可。")
            return
        }
        let task = Process()
        let pipe = Pipe()
        task.executableURL = URL(fileURLWithPath: python)
        task.arguments = [resources.appendingPathComponent("server.py").path,
                          "--root", resources.appendingPathComponent("web").path,
                          "--parent-pid", String(getpid())]
        task.standardInput = FileHandle.nullDevice
        task.standardOutput = FileHandle.nullDevice
        task.standardError = pipe
        task.currentDirectoryURL = resources
        task.terminationHandler = { process in
            let message = String(data: pipe.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
            DispatchQueue.main.async {
                guard !self.exiting else { return }
                if self.ready {
                    NSApp.terminate(nil)
                } else {
                    // A simultaneous launch may have won the port.
                    self.health { info in
                        if let info = info, info["version"] as? String == "1.5.0" {
                            self.server = nil
                            self.accept(info)
                            self.startMonitor()
                        } else {
                            self.fail("无法启动 Staff Analyzer",
                                      "本地地址 localhost:8000 可能正被其他程序或旧版启动器使用。请先关闭原来的服务，再重试。\n\n" + String(message.prefix(600)))
                        }
                    }
                }
            }
        }
        server = task
        errorPipe = pipe
        do {
            try task.run()
            startupDeadline = Date().addingTimeInterval(10)
            waitUntilReady()
        } catch {
            fail("启动失败", error.localizedDescription)
        }
    }

    private func waitUntilReady() {
        guard !exiting, server?.isRunning == true else { return }
        health { info in
            if let info = info {
                self.accept(info)
                self.startMonitor()
            } else if Date() < self.startupDeadline {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) { self.waitUntilReady() }
            } else {
                self.fail("启动超时", "本地服务未能准备就绪。请重新打开应用。")
            }
        }
    }

    private func accept(_ info: [String: Any]) {
        sessionToken = info["token"] as? String
        sessionInstance = info["instance"] as? String
        if !ready {
            ready = true
            openBrowser()
        }
    }

    private func startMonitor() {
        monitor?.invalidate()
        // The owned child also has a termination handler. This covers reused servers.
        monitor = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { _ in
            self.health { info in
                if info == nil || info?["instance"] as? String != self.sessionInstance {
                    NSApp.terminate(nil)
                }
            }
        }
    }

    private func fail(_ title: String, _ message: String) {
        guard !exiting else { return }
        let alert = NSAlert()
        alert.messageText = title
        alert.informativeText = message
        alert.addButton(withTitle: "好")
        NSApp.activate(ignoringOtherApps: true)
        alert.runModal()
        NSApp.terminate(nil)
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if ready { openBrowser() }
        return true
    }

    func applicationWillTerminate(_ notification: Notification) {
        exiting = true
        monitor?.invalidate()
        if let process = server, process.isRunning {
            process.terminate()
            let deadline = Date().addingTimeInterval(2)
            while process.isRunning && Date() < deadline { Thread.sleep(forTimeInterval: 0.03) }
            if process.isRunning { kill(process.processIdentifier, SIGKILL) }
        } else if server == nil, let token = sessionToken {
            // Only the server that supplied our token can accept this request.
            var request = URLRequest(url: base.appendingPathComponent("__app/shutdown"))
            request.httpMethod = "POST"
            request.setValue(base.absoluteString, forHTTPHeaderField: "Origin")
            request.setValue(token, forHTTPHeaderField: "X-Staff-Token")
            let finished = DispatchSemaphore(value: 0)
            http.dataTask(with: request) { _, _, _ in finished.signal() }.resume()
            _ = finished.wait(timeout: .now() + 2)
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.regular)
app.run()
