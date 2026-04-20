# Mobile APK Build Guide (Amazon Linux / EC2)

## 1. System updates & basic tools

```bash
dnf update -y
dnf install -y git curl wget unzip tar bzip2 which
```

## 2. Node.js 20 (LTS)

```bash
curl -fsSL https://rpm.nodesource.com/setup_20.x | bash -
dnf install -y nodejs
node -v && npm -v
```

## 3. Java 17 (JDK)

```bash
dnf install -y java-17-amazon-corretto-devel
java -version
```

## 4. Android SDK

```bash
mkdir -p /opt/android-sdk/cmdline-tools
cd /tmp
wget https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-11076708_latest.zip -d /opt/android-sdk/cmdline-tools
mv /opt/android-sdk/cmdline-tools/cmdline-tools /opt/android-sdk/cmdline-tools/latest
```

## 5. Environment variables

```bash
cat >> ~/.bashrc << 'EOF'
export ANDROID_HOME=/opt/android-sdk
export PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin
export PATH=$PATH:$ANDROID_HOME/platform-tools
export PATH=$PATH:$ANDROID_HOME/build-tools/35.0.0
export JAVA_HOME=/usr/lib/jvm/java-17-amazon-corretto
EOF

source ~/.bashrc
```

## 6. Install Android SDK components

```bash
yes | sdkmanager --licenses
sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"
```

## 7. Add swap (prevents OOM / Gradle crashes)

```bash
fallocate -l 4G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
free -h
```

## 8. Clone project & install dependencies

```bash
cd /root
git clone <your-repo-url> company-app
cd company-app/mobile
npm install
```

## 9. Prebuild & build APK

```bash
cd /root/company-app/mobile
npx expo prebuild --clean --platform android

cd android
./gradlew assembleRelease --max-workers=2

# Serve the APK for download
cd app/build/outputs/apk/release/
python3 -m http.server 8000 --bind 0.0.0.0
```

---

## Firebase Push Notifications Setup

> **Note:** The existing Firebase project (`android-app-834d8`, package `com.gifthighway`) is already configured and working from the order-kanban-app. `google-services.json` has been copied to `mobile/` as a reference. When building for production, either reuse this project (if package name stays `com.gifthighway`) or create a new one for `com.company.app` following the steps below.

### Step 1 — Create new Firebase project
- Go to [console.firebase.google.com](https://console.firebase.google.com)
- Click **Add project**
- Name: `kanban-push` → Continue
- Disable Google Analytics → Create project

### Step 2 — Add Android app
- Click Android icon (Add app)
- Package name: `com.gifthighway`
- Nickname: `KanbanFlow` → Register app
- Download `google-services.json` → save it
- Click Next → Next → Continue to console

### Step 3 — Download Service Account Key
- Click gear icon → **Project Settings**
- **Service Accounts** tab
- Click **Generate new private key** → Generate key
- Save the downloaded JSON file

### Step 4 — Replace files locally

```bash
cp ~/Downloads/google-services.json /path/to/company-app/mobile/google-services.json
```

### Step 5 — Upload to Expo via CLI

```bash
cd /path/to/company-app/mobile
eas credentials --platform android
# Choose: production → Google Service Account
# → Manage your Google Service Account Key for Push Notifications (FCM V1)
# → Set up a Google Service Account Key for Push Notifications (FCM V1)
# Path: ~/Downloads/kanban-push-firebase-adminsdk-xxxxx.json
```

### Step 6 — Push & rebuild
