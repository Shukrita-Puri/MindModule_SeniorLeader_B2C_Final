import sys

pbx_path = "ios/App/App.xcodeproj/project.pbxproj"
with open(pbx_path, "r") as f:
    content = f.read()

if "NativeAuth0Refresher.swift" in content:
    print("Already in pbxproj")
    sys.exit(0)

build_file = "\t\t999999999999999999999901 /* NativeAuth0Refresher.swift in Sources */ = {isa = PBXBuildFile; fileRef = 999999999999999999999902 /* NativeAuth0Refresher.swift */; };\n"
file_ref = "\t\t999999999999999999999902 /* NativeAuth0Refresher.swift */ = {isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NativeAuth0Refresher.swift; sourceTree = \"<group>\"; };\n"

content = content.replace("/* Begin PBXBuildFile section */\n", "/* Begin PBXBuildFile section */\n" + build_file)
content = content.replace("/* Begin PBXFileReference section */\n", "/* Begin PBXFileReference section */\n" + file_ref)

group_target = "504EC3061FED79650016851F /* App */ = {\n\t\t\tisa = PBXGroup;\n\t\t\tchildren = (\n"
group_insert = "\t\t\t\t999999999999999999999902 /* NativeAuth0Refresher.swift */,\n"
content = content.replace(group_target, group_target + group_insert)

sources_target = "504EC3001FED79650016851F /* Sources */ = {\n\t\t\tisa = PBXSourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n"
sources_insert = "\t\t\t\t999999999999999999999901 /* NativeAuth0Refresher.swift in Sources */,\n"
content = content.replace(sources_target, sources_target + sources_insert)

with open(pbx_path, "w") as f:
    f.write(content)
print("Updated pbxproj")
