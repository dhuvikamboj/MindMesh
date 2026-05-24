#!/usr/bin/env ruby
# Adds the MindMeshShare extension target to the Xcode project programmatically.
# Run once: ruby scripts/add_share_extension.rb
#
# Requires: gem install xcodeproj
#   gem install xcodeproj

require 'xcodeproj'
require 'fileutils'

PROJ_PATH      = File.expand_path('../ios/MindMesh.xcodeproj', __dir__)
EXT_NAME       = 'MindMeshShare'
EXT_BUNDLE_ID  = 'com.dhuviads.MindMesh.ShareExtension'
APP_GROUP      = 'group.com.dhuviads.MindMesh.share'
EXT_DIR        = File.expand_path("../ios/#{EXT_NAME}", __dir__)
SWIFT_VERSION  = '5.0'

proj = Xcodeproj::Project.open(PROJ_PATH)

# ── Guard: already added? ─────────────────────────────────────────────────────
if proj.targets.any? { |t| t.name == EXT_NAME }
  puts "Target '#{EXT_NAME}' already exists — nothing to do."
  exit 0
end

# ── Add target ────────────────────────────────────────────────────────────────
target = proj.new_target(
  :app_extension,
  EXT_NAME,
  :ios,
  '15.0',
  proj.frameworks_group,
  :swift
)

# ── Build settings ────────────────────────────────────────────────────────────
['Debug', 'Release'].each do |config_name|
  settings = target.build_settings(config_name)
  settings['PRODUCT_BUNDLE_IDENTIFIER'] = EXT_BUNDLE_ID
  settings['SWIFT_VERSION']             = SWIFT_VERSION
  settings['INFOPLIST_FILE']            = "#{EXT_NAME}/Info.plist"
  settings['CODE_SIGN_ENTITLEMENTS']    = "#{EXT_NAME}/#{EXT_NAME}.entitlements"
  settings['TARGETED_DEVICE_FAMILY']    = '1,2'
  settings['IPHONEOS_DEPLOYMENT_TARGET'] = '15.0'
end

# ── Add source files to target ────────────────────────────────────────────────
ext_group = proj.main_group.new_group(EXT_NAME, EXT_NAME)

['ShareViewController.swift', 'Info.plist', "#{EXT_NAME}.entitlements"].each do |fname|
  path = File.join(EXT_DIR, fname)
  ref  = ext_group.new_file(path)
  target.add_file_references([ref]) if fname.end_with?('.swift')
end

# ── Embed extension in main app ───────────────────────────────────────────────
main_target = proj.targets.find { |t| t.name == 'MindMesh' }
unless main_target
  puts 'ERROR: MindMesh target not found.'
  exit 1
end

embed_phase = main_target.new_copy_files_build_phase('Embed App Extensions')
embed_phase.dst_subfolder_spec = '13' # Plug-ins / app extensions
ext_ref = target.product_reference
embed_phase.add_file_reference(ext_ref)

proj.save
puts "✅ '#{EXT_NAME}' target added to #{PROJ_PATH}"
puts ''
puts 'Next steps in Xcode:'
puts '  1. Select MindMesh project → Signing & Capabilities'
puts "  2. Add capability: App Groups → #{APP_GROUP} (on both MindMesh and #{EXT_NAME} targets)"
puts '  3. Build & run'
