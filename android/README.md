# Android package (Trusted Web Activity)

Google Play wrapper around https://petanque.amunozo.com/, generated with
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) 1.25. The app has no
game code of its own; it opens the website full-screen. `twa-manifest.json` is the
source of truth, the rest of this folder is generated from it.

- Package id: `com.amunozo.petanque` (never changes). Host `petanque.amunozo.com`, start URL `/`.
- Theme / navigation / background colour `#a95f3a`, portrait, fallback `customtabs`.
- Icons are fetched by Bubblewrap from the live web manifest (any, maskable, monochrome 512).

## Signing
Play App Signing is used. `upload-keystore.jks` (alias `upload`) is the **upload key**.
It is NOT in the repo (`*.jks` and `*.keystore` are gitignored); the owner keeps it, with
its passwords, in safe storage. `signingKey.path` in `twa-manifest.json` is the relative
placeholder `./upload-keystore.jks`: put the keystore there (or edit the path locally,
without committing it). Never commit keystores or passwords.

`public/.well-known/assetlinks.json` must list the SHA-256 of the key that signs the
installed app: the Play App Signing key (Play Console -> Test and release -> App
integrity) for store installs, and the upload key for sideloaded APKs built here.

## Rebuild
Tools (outside the repo): JDK 17, Android SDK (cmdline-tools, `platforms;android-36`,
`build-tools;36.1.0`; accept licences) and `npm i @bubblewrap/cli`. Point Bubblewrap at them
with `~/.bubblewrap/config.json`:

    {"jdkPath": "/path/to/jdk17", "androidSdkPath": "/path/to/android-sdk"}

(Bubblewrap checks that `<androidSdkPath>/bin` or `/tools` exists; symlink
`bin -> cmdline-tools/latest/bin` if needed.) Then, from `android/`:

    bubblewrap update --skipVersionUpgrade     # regenerate the project from twa-manifest.json
    export BUBBLEWRAP_KEYSTORE_PASSWORD=...  BUBBLEWRAP_KEY_PASSWORD=...
    bubblewrap build --skipPwaValidation       # writes app-release-bundle.aab + app-release-signed.apk

Upload `app-release-bundle.aab` to Play Console; sideload the `.apk` for testing
(`adb install app-release-signed.apk`). Build outputs are gitignored.

## Every new upload
Bump `appVersionCode` (integer, must increase for each upload) in `twa-manifest.json`,
and `appVersionName` to match `package.json`, then run `bubblewrap update` and `build`.
The site content itself updates without a new Android release.

## Building from the Claude Code cloud environment
The cloud container is wiped between sessions, so the tools must be reinstalled:
Temurin JDK 17 and the Android SDK (`platforms;android-36`, `build-tools;36.1.0`,
with a `<sdk>/bin` symlink to `cmdline-tools/latest/bin`) under `~/tools`, and
`@bubblewrap/cli` via npm. Run Node with `NODE_USE_ENV_PROXY=1`, put the proxy
from `$JAVA_TOOL_OPTIONS` in `~/.gradle/gradle.properties`, and if Maven Central
answers HTTP 429, add a `~/.gradle/init.d/` script that puts Google's Maven Central
mirror (`https://maven-central.storage-download.googleapis.com/maven2/`) first.
Write `twa-manifest.json` by hand, then run `bubblewrap update --skipVersionUpgrade`
and `bubblewrap build --skipPwaValidation`. The keystore comes from the owner.
