Step 1 — Create new Firebase project
Go to console.firebase.google.com
Click "Add project"
Name: kanban-push → Continue
Disable Google Analytics → Create project
Step 2 — Add Android app
Click Android icon (Add app)
Package name: com.gifthighway
Nickname: KanbanFlow → Register app
Download google-services.json → save it
Click Next → Next → Continue to console
Step 3 — Download Service Account Key
Click gear icon → Project Settings
Service Accounts tab
Click "Generate new private key" → Generate key
Save the downloaded JSON file
Step 4 — Replace files locally

cp ~/Downloads/google-services.json /Users/vamsy/Desktop/mobile-app/order-kanban-app/google-services.json
cp ~/Downloads/google-services.json /Users/vamsy/Desktop/mobile-app/order-kanban-app/mobile-main/google-services.json
Step 5 — Upload to Expo via CLI

cd /Users/vamsy/Desktop/mobile-app/order-kanban-app/mobile-main
eas credentials --platform android
production
Google Service Account
Manage your Google Service Account Key for Push Notifications (FCM V1)
Set up a Google Service Account Key for Push Notifications (FCM V1)
Path: ~/Downloads/kanban-push-firebase-adminsdk-xxxxx.json
Step 6 — Push & rebuild

# access token

Steps:

Click "Access tokens" in the left sidebar (you can already see it highlighted in screenshot 2)

On the Access Tokens page, click "Create token"

Give it a name — e.g. gift-highway-push — then click Create

Copy the token immediately — it's only shown once

Paste it into your .env file:

EXPO_ACCESS_TOKEN=your_token_here

Steps:

Click "Add robot"

Give it a name like push-service and click Create

Once the robot is created, click on it — you'll see a "Generate token" or "Add token" button

Click it, copy the token immediately (shown once)

Paste into your .env:

EXPO_ACCESS_TOKEN=your_token_here
Why robot user and not personal token?

Robot users are the right choice for a backend service — they're scoped to the gift-highway account, don't expire when you change your personal password, and are meant exactly for automated push sending. Personal tokens are tied to your login and would break the push service if you ever log out or rotate your password.
