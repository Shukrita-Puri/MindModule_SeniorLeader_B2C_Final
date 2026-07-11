#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PBXPROJ="$PROJECT_DIR/App.xcodeproj/project.pbxproj"

if [[ ! -f "$PBXPROJ" ]]; then
  echo "Error: Xcode project file not found at $PBXPROJ"
  exit 1
fi

required_files=(
  "WearableSyncBridge.swift"
  "NativeBackgroundSyncPlugin.swift"
  "AppleCalendarBackgroundSyncBridge.swift"
  "NativeOutbox.swift"
  "HealthKitSyncManager.swift"
  "HealthKitAnchorStore.swift"
  "HealthKitSampleNormalizer.swift"
  "WearableStatusWriter.swift"
)

missing=0
for file in "${required_files[@]}"; do
  file_ref_count=$(grep -F "/* $file */ = {isa = PBXFileReference" "$PBXPROJ" | wc -l)
  source_count=$(grep -F "/* $file in Sources */" "$PBXPROJ" | wc -l)

  if [[ "$file_ref_count" -lt 1 ]]; then
    echo "Missing PBXFileReference for $file"
    missing=1
  fi
  if [[ "$source_count" -lt 1 ]]; then
    echo "Missing source build phase entry for $file"
    missing=1
  fi

done

if [[ "$missing" -eq 0 ]]; then
  echo "✅ iOS native sync files are present in App.xcodeproj sources."
  exit 0
fi

exit 1
