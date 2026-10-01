Pod::Spec.new do |s|
  s.name           = 'SpiceEngine'
  s.version        = '1.0.0'
  s.summary        = 'SPICE native audio engine for iOS.'
  s.description    = 'AVPlayer playback with background audio, lock-screen controls, and crossfade.'
  s.license        = 'UNLICENSED'
  s.author         = 'Spice'
  s.homepage       = 'https://music.spice-app.xyz'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: 'https://github.com/Spice-Production/SPICE.git' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.source_files = '**/*.{h,m,swift}'
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
end
