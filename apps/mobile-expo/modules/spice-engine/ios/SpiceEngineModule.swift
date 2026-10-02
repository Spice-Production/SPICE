import AVFoundation
import ExpoModulesCore
import MediaPlayer
import UIKit

/// JS bridge for SPICE's iOS audio engine: AVPlayer playback with background
/// audio, lock-screen controls, and a two-player crossfade.
///
/// Unlike the Android engine there is no native queue continuation: iOS keeps
/// the app running while audio plays, so the JS controller advances the queue.
/// Search, stream resolution, and shuffle priorities also stay in JS.
public class SpiceEngineModule: Module {
  private let player = SpicePlayer()

  public func definition() -> ModuleDefinition {
    Name("SpiceEngine")

    Events(
      "onPlayerState",
      "onPlaybackEnded",
      "onTrackRepeated",
      "onCrossfadeCompleted",
      "onCrossfadeFailed",
      "onRemoteCommand"
    )

    OnCreate {
      self.player.onState = { [weak self] state in self?.sendEvent("onPlayerState", state) }
      self.player.onEnded = { [weak self] mediaId in self?.sendEvent("onPlaybackEnded", ["mediaId": mediaId]) }
      self.player.onRepeated = { [weak self] in self?.sendEvent("onTrackRepeated", [:]) }
      self.player.onCrossfadeCompleted = { [weak self] key in self?.sendEvent("onCrossfadeCompleted", ["trackKey": key]) }
      self.player.onCrossfadeFailed = { [weak self] key in self?.sendEvent("onCrossfadeFailed", ["trackKey": key]) }
      self.player.onRemoteCommand = { [weak self] command in self?.sendEvent("onRemoteCommand", ["command": command]) }
    }

    OnDestroy {
      self.player.teardown()
    }

    AsyncFunction("connect") { () -> [String: Any?] in
      self.player.connect()
      return self.player.snapshot()
    }.runOnQueue(.main)

    AsyncFunction("play") { (track: [String: Any], streamUrl: String, _: [String: Any]?) in
      self.player.play(track: SpiceTrack(track), streamUrl: streamUrl)
    }.runOnQueue(.main)

    AsyncFunction("toggle") { self.player.toggle() }.runOnQueue(.main)
    AsyncFunction("pause") { self.player.pause() }.runOnQueue(.main)
    AsyncFunction("seekTo") { (positionMs: Double) in self.player.seek(toMs: positionMs) }.runOnQueue(.main)
    AsyncFunction("seekBy") { (deltaMs: Double) in self.player.seek(byMs: deltaMs) }.runOnQueue(.main)
    AsyncFunction("setVolume") { (volume: Double) in self.player.setVolume(volume) }.runOnQueue(.main)
    AsyncFunction("setShuffle") { (enabled: Bool) in self.player.setShuffle(enabled) }.runOnQueue(.main)
    AsyncFunction("setRepeatMode") { (mode: String) in self.player.setRepeatMode(mode) }.runOnQueue(.main)
    AsyncFunction("stop") { self.player.stop() }.runOnQueue(.main)
    AsyncFunction("clearError") { self.player.clearError() }.runOnQueue(.main)
    // Android mirrors Like into its notification; the iOS lock screen has no such button.
    AsyncFunction("setLiked") { (_: Bool) in }

    // The Android playback service reads these to continue the queue; JS owns it here.
    AsyncFunction("updatePlaybackContextSettings") { (_: String, _: Double) in }
    AsyncFunction("restoredPlaybackContext") { (_: String) -> [String: Any]? in nil }

    AsyncFunction("prepareCrossfade") { (args: [String: Any], promise: Promise) in
      let track = SpiceTrack(args["track"] as? [String: Any] ?? [:])
      self.player.prepareCrossfade(
        trackKey: args["trackKey"] as? String ?? track.id,
        track: track,
        streamUrl: args["streamUrl"] as? String ?? ""
      ) { ready in promise.resolve(ready) }
    }.runOnQueue(.main)

    AsyncFunction("startPreparedCrossfade") { (durationMs: Double) -> Bool in
      self.player.startPreparedCrossfade(durationMs: durationMs)
    }.runOnQueue(.main)

    AsyncFunction("cancelPreparedCrossfade") { self.player.cancelPreparedCrossfade() }.runOnQueue(.main)
  }
}

struct SpiceTrack {
  let id: String
  let title: String
  let artist: String
  let album: String
  let durationMs: Double
  let artworkUrl: String
  let localUri: String

  init(_ map: [String: Any]) {
    id = map["id"] as? String ?? ""
    title = map["title"] as? String ?? ""
    artist = map["artist"] as? String ?? ""
    album = map["album"] as? String ?? ""
    durationMs = (map["durationMs"] as? NSNumber)?.doubleValue ?? 0
    artworkUrl = map["artworkUrl"] as? String ?? ""
    localUri = map["localUri"] as? String ?? ""
  }
}

/// Owns the AVPlayers. Every method runs on the main queue.
final class SpicePlayer {
  var onState: (([String: Any?]) -> Void)?
  var onEnded: ((String) -> Void)?
  var onRepeated: (() -> Void)?
  var onCrossfadeCompleted: ((String) -> Void)?
  var onCrossfadeFailed: ((String) -> Void)?
  var onRemoteCommand: ((String) -> Void)?

  private var active = AVPlayer()
  private var track: SpiceTrack?
  private var volume: Float = 1
  private var shuffleEnabled = false
  private var repeatMode = "Off"
  private var error: String?
  private var wantsPlayback = false
  private var connected = false
  private var artwork: MPMediaItemArtwork?
  private var artworkTask: URLSessionDataTask?

  private var timeObserver: Any?
  private var statusObservation: NSKeyValueObservation?
  private var itemObservation: NSKeyValueObservation?
  private var notificationTokens: [NSObjectProtocol] = []

  private var pending: AVPlayer?
  private var pendingTrack: SpiceTrack?
  private var pendingKey = ""
  private var pendingObservation: NSKeyValueObservation?
  private var pendingTimeout: DispatchWorkItem?
  private var fadeTimer: Timer?
  private var fadingOut: AVPlayer?

  // MARK: Lifecycle

  func connect() {
    guard !connected else { return }
    connected = true
    configureRemoteCommands()
    observe(player: active)
    let center = NotificationCenter.default
    notificationTokens.append(center.addObserver(forName: .AVPlayerItemDidPlayToEndTime, object: nil, queue: .main) { [weak self] note in
      self?.handleEnded(note.object as? AVPlayerItem)
    })
    notificationTokens.append(center.addObserver(forName: .AVPlayerItemFailedToPlayToEndTime, object: nil, queue: .main) { [weak self] note in
      guard let self = self, let item = note.object as? AVPlayerItem, item === self.active.currentItem else { return }
      let failure = note.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error
      self.fail(failure?.localizedDescription ?? "Playback stopped unexpectedly.")
    })
    notificationTokens.append(center.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
      self?.handleInterruption(note)
    })
  }

  func teardown() {
    cancelPreparedCrossfade()
    fadeTimer?.invalidate()
    fadingOut?.pause()
    unobserve(player: active)
    active.pause()
    notificationTokens.forEach { NotificationCenter.default.removeObserver($0) }
    notificationTokens.removeAll()
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    connected = false
  }

  // MARK: Playback

  func play(track next: SpiceTrack, streamUrl: String) {
    connect()
    cancelPreparedCrossfade()
    finishFade(completed: false)
    let source = next.localUri.isEmpty ? streamUrl : next.localUri
    guard let url = URL(string: source) ?? URL(string: source.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "") else {
      fail("This track has no playable address.")
      return
    }
    activateSession()
    track = next
    error = nil
    wantsPlayback = true
    loadArtwork(for: next)
    let item = AVPlayerItem(url: url)
    observe(item: item)
    active.replaceCurrentItem(with: item)
    active.volume = volume
    active.play()
    publish()
  }

  func toggle() {
    if active.timeControlStatus == .paused { resume() } else { pause() }
  }

  func pause() {
    wantsPlayback = false
    active.pause()
    publish()
  }

  private func resume() {
    guard active.currentItem != nil else { return }
    activateSession()
    wantsPlayback = true
    active.play()
    publish()
  }

  func seek(toMs positionMs: Double) {
    let target = CMTime(seconds: max(0, positionMs) / 1000, preferredTimescale: 1000)
    active.seek(to: target, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] _ in self?.publish() }
  }

  func seek(byMs deltaMs: Double) {
    seek(toMs: positionMs() + deltaMs)
  }

  func setVolume(_ percent: Double) {
    volume = Float(min(max(percent, 0), 100) / 100)
    if fadeTimer == nil { active.volume = volume }
    publish()
  }

  func setShuffle(_ enabled: Bool) {
    shuffleEnabled = enabled
    publish()
  }

  func setRepeatMode(_ mode: String) {
    repeatMode = ["Off", "All", "One"].contains(mode) ? mode : "Off"
    publish()
  }

  func stop() {
    cancelPreparedCrossfade()
    finishFade(completed: false)
    wantsPlayback = false
    active.pause()
    active.replaceCurrentItem(with: nil)
    track = nil
    artwork = nil
    MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    publish()
  }

  func clearError() {
    error = nil
    publish()
  }

  private func fail(_ message: String) {
    error = message
    wantsPlayback = false
    publish()
  }

  private func handleEnded(_ item: AVPlayerItem?) {
    guard let item = item, item === active.currentItem else { return }
    if repeatMode == "One" {
      active.seek(to: .zero) { [weak self] _ in
        self?.active.play()
        self?.onRepeated?()
      }
      return
    }
    wantsPlayback = false
    publish()
    onEnded?(track?.id ?? "")
  }

  private func handleInterruption(_ note: Notification) {
    guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
          let kind = AVAudioSession.InterruptionType(rawValue: raw) else { return }
    if kind == .began {
      publish()
      return
    }
    let options = AVAudioSession.InterruptionOptions(rawValue: note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0)
    if options.contains(.shouldResume) && wantsPlayback { resume() }
  }

  private func activateSession() {
    let session = AVAudioSession.sharedInstance()
    try? session.setCategory(.playback, mode: .default)
    try? session.setActive(true)
  }

  // MARK: Crossfade

  func prepareCrossfade(trackKey: String, track next: SpiceTrack, streamUrl: String, completion: @escaping (Bool) -> Void) {
    cancelPreparedCrossfade()
    let source = next.localUri.isEmpty ? streamUrl : next.localUri
    guard let url = URL(string: source) else {
      completion(false)
      return
    }
    let player = AVPlayer(playerItem: AVPlayerItem(url: url))
    player.volume = 0
    pending = player
    pendingTrack = next
    pendingKey = trackKey

    var settled = false
    let settle: (Bool) -> Void = { [weak self] ready in
      guard !settled else { return }
      settled = true
      self?.pendingObservation = nil
      self?.pendingTimeout?.cancel()
      self?.pendingTimeout = nil
      if !ready, self?.pending === player { self?.discardPending() }
      completion(ready)
    }
    pendingObservation = player.currentItem?.observe(\.status, options: [.initial, .new]) { item, _ in
      DispatchQueue.main.async {
        if item.status == .readyToPlay { settle(true) } else if item.status == .failed { settle(false) }
      }
    }
    let timeout = DispatchWorkItem { settle(false) }
    pendingTimeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 10, execute: timeout)
  }

  func startPreparedCrossfade(durationMs: Double) -> Bool {
    guard let incoming = pending, let next = pendingTrack, incoming.currentItem?.status == .readyToPlay else { return false }
    let key = pendingKey
    let outgoing = active
    pending = nil
    pendingTrack = nil
    pendingKey = ""

    finishFade(completed: false)
    unobserve(player: outgoing)
    active = incoming
    track = next
    error = nil
    wantsPlayback = true
    observe(player: incoming)
    if let item = incoming.currentItem { observe(item: item) }
    loadArtwork(for: next)
    incoming.volume = 0
    incoming.play()
    fadingOut = outgoing

    let duration = max(durationMs, 200) / 1000
    let started = Date()
    let from = outgoing.volume
    fadeTimer = Timer.scheduledTimer(withTimeInterval: 0.05, repeats: true) { [weak self] _ in
      guard let self = self else { return }
      let progress = Float(min(Date().timeIntervalSince(started) / duration, 1))
      incoming.volume = self.volume * progress
      outgoing.volume = from * (1 - progress)
      if progress >= 1 {
        self.finishFade(completed: true)
        self.onCrossfadeCompleted?(key)
      }
    }
    publish()
    return true
  }

  func cancelPreparedCrossfade() {
    pendingObservation = nil
    pendingTimeout?.cancel()
    pendingTimeout = nil
    discardPending()
  }

  private func discardPending() {
    pending?.pause()
    pending = nil
    pendingTrack = nil
    pendingKey = ""
  }

  private func finishFade(completed: Bool) {
    fadeTimer?.invalidate()
    fadeTimer = nil
    fadingOut?.pause()
    fadingOut?.replaceCurrentItem(with: nil)
    fadingOut = nil
    active.volume = volume
    if completed { publish() }
  }

  // MARK: Observation

  private func observe(player: AVPlayer) {
    statusObservation = player.observe(\.timeControlStatus, options: [.new]) { [weak self] _, _ in
      DispatchQueue.main.async { self?.publish() }
    }
    timeObserver = player.addPeriodicTimeObserver(forInterval: CMTime(seconds: 0.5, preferredTimescale: 600), queue: .main) { [weak self] _ in
      self?.publish()
    }
  }

  private func unobserve(player: AVPlayer) {
    statusObservation = nil
    if let observer = timeObserver { player.removeTimeObserver(observer) }
    timeObserver = nil
  }

  private func observe(item: AVPlayerItem) {
    itemObservation = item.observe(\.status, options: [.new]) { [weak self] item, _ in
      DispatchQueue.main.async {
        guard let self = self, item === self.active.currentItem else { return }
        if item.status == .failed {
          self.fail(item.error?.localizedDescription ?? "This stream could not be played.")
        } else {
          self.publish()
        }
      }
    }
  }

  // MARK: State

  private func positionMs() -> Double {
    let seconds = active.currentTime().seconds
    return seconds.isFinite ? max(0, seconds * 1000) : 0
  }

  private func durationMs() -> Double {
    let seconds = active.currentItem?.duration.seconds ?? .nan
    if seconds.isFinite && seconds > 0 { return seconds * 1000 }
    return track?.durationMs ?? 0
  }

  func snapshot() -> [String: Any?] {
    let status = active.timeControlStatus
    return [
      "connected": connected,
      "mediaId": track?.id ?? "",
      "title": track?.title ?? "",
      "artist": track?.artist ?? "",
      "artworkUrl": track?.artworkUrl ?? "",
      "isPlaying": status == .playing,
      "isBuffering": status == .waitingToPlayAtSpecifiedRate && track != nil,
      "positionMs": positionMs(),
      "durationMs": durationMs(),
      "volume": Int((volume * 100).rounded()),
      "shuffleEnabled": shuffleEnabled,
      "repeatMode": repeatMode,
      "localCrossfadeSupported": true,
      "error": error,
    ]
  }

  private func publish() {
    updateNowPlaying()
    onState?(snapshot())
  }

  // MARK: Lock screen

  private func configureRemoteCommands() {
    UIApplication.shared.beginReceivingRemoteControlEvents()
    let commands = MPRemoteCommandCenter.shared()
    commands.playCommand.addTarget { [weak self] _ in
      self?.resume()
      return .success
    }
    commands.pauseCommand.addTarget { [weak self] _ in
      self?.pause()
      return .success
    }
    commands.togglePlayPauseCommand.addTarget { [weak self] _ in
      self?.toggle()
      return .success
    }
    commands.nextTrackCommand.addTarget { [weak self] _ in
      self?.onRemoteCommand?("next")
      return .success
    }
    commands.previousTrackCommand.addTarget { [weak self] _ in
      self?.onRemoteCommand?("previous")
      return .success
    }
    commands.changePlaybackPositionCommand.addTarget { [weak self] event in
      guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
      self?.seek(toMs: event.positionTime * 1000)
      return .success
    }
  }

  private func updateNowPlaying() {
    guard let track = track else { return }
    var info: [String: Any] = [
      MPMediaItemPropertyTitle: track.title,
      MPMediaItemPropertyArtist: track.artist,
      MPMediaItemPropertyAlbumTitle: track.album,
      MPMediaItemPropertyPlaybackDuration: durationMs() / 1000,
      MPNowPlayingInfoPropertyElapsedPlaybackTime: positionMs() / 1000,
      MPNowPlayingInfoPropertyPlaybackRate: active.timeControlStatus == .playing ? 1.0 : 0.0,
    ]
    if let artwork = artwork { info[MPMediaItemPropertyArtwork] = artwork }
    MPNowPlayingInfoCenter.default().nowPlayingInfo = info
  }

  private func loadArtwork(for track: SpiceTrack) {
    artworkTask?.cancel()
    artwork = nil
    guard let url = URL(string: track.artworkUrl), url.scheme == "https" else { return }
    let trackId = track.id
    let task = URLSession.shared.dataTask(with: url) { [weak self] data, _, _ in
      guard let data = data, let image = UIImage(data: data) else { return }
      DispatchQueue.main.async {
        guard let self = self, self.track?.id == trackId else { return }
        self.artwork = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
        self.updateNowPlaying()
      }
    }
    artworkTask = task
    task.resume()
  }
}
