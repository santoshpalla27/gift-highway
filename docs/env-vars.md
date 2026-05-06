create a bucket from the ui

then allow cors in setting

```json
[
  {
    "AllowedOrigins": [
      "https://test.santoshdevops.cloud"
    ],
    "AllowedMethods": [
      "GET",
      "PUT"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "MaxAgeSeconds": 3600
  }
]

copy

Name:
app-data. env vars:- AUDIT_R2_BUCKET , R2_BUCKET

S3 API:
Click to copy.  env var :- R2_PUBLIC_URL

===============

access key and secret access key

get to the main R2 Object Storage dashboard in account detils copy account id  --> env var :- R2_ACCOUNT_ID.

then clieck manage api tokens

Create Account API Token

choose name and bucket and read and edit permmison and create token

give object read write permmison to that key

COPY Access Key ID and Secret Access Key env vars:- R2_ACCESS_KEY, R2_SECRET_KEY


==============================

cf api token for the dns

Go to dash.cloudflare.com → log in

Click your profile icon (top-right corner) → select "My Profile"

In the left sidebar, click "API Tokens"

Click the blue "Create Token" button

Scroll down to the bottom, click "Create Custom Token" (Get started)

Fill in:

Token name: anything, e.g. gift-highway-dns
Permissions: click "Add more" and set:
Zone | DNS | Edit
Zone Resources:
Include | Specific zone | select your domain
Click "Continue to summary" → "Create Token"

Copy the token immediately — Cloudflare shows it only once. If you miss it, you have to delete and create a new one.

Paste it in your .env:

CF_API_TOKEN=your_copied_token_here
```

=========================

S3_ACCESS_KEY and S3_SECRET_KEY

Go to console.aws.amazon.com → log in
Click your account name (top-right) → "Security credentials"
Scroll to "Access keys" section
Click "Create access key"
Select "Application running outside AWS" → Next
Copy both:
Access key ID → S3_ACCESS_KEY
Secret access key → S3_SECRET_KEY (shown only once)

S3_BUCKET

Go to S3 in the AWS console
Click "Create bucket"
Enter a bucket name (e.g. gift-highway-backup)
Choose region us-east-1 (matches your S3_REGION)
Leave Block Public Access ON (private bucket)
Click "Create bucket"
That bucket name → S3_BUCKET

===================

WT_SECRET — just a random hex string, run this in your terminal:

openssl rand -hex 32
Copy the output → paste as JWT_SECRET=<output>

====================

ADMIN_AUTH — format is username:bcrypt_hash. Run:

Ubuntu:

sudo apt update && sudo apt install -y apache2-utils
htpasswd -nbB admin yourpassword
Amazon Linux:

sudo yum install -y httpd-tools
htpasswd -nbB admin yourpassword

Output looks like:
admin:$2y$05$xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

add $ after : to the env
