# BHP Lookup API — Siri Shortcut Setup Guide

A free serverless API that looks up the BHP of any UK-registered vehicle by registration plate. Designed to be called from a Siri Shortcut for totally hands-free use.

---

## Step 1 — Deploy to Vercel (5 minutes)

### 1a. Create a GitHub repository

1. Go to [github.com](https://github.com) and sign in (or create a free account)
2. Click **New repository**
3. Name it `bhp-lookup` and set it to **Public**
4. Click **Create repository**
5. Upload all files from this folder into the repository

### 1b. Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with your GitHub account
2. Click **Add New → Project**
3. Select your `bhp-lookup` repository
4. Leave all settings as default
5. Click **Deploy**

After ~30 seconds, Vercel gives you a live URL like:
```
https://bhp-lookup-yourname.vercel.app
```

### 1c. Test it in your browser

Visit:
```
https://bhp-lookup-yourname.vercel.app/api/bhp?reg=AB12CDE
```

You should see a JSON response like:
```json
{
  "success": true,
  "reg": "AB12CDE",
  "bhp": "150",
  "make": "Ford",
  "model": "Focus",
  "year": "2012",
  "fuel": "Petrol",
  "speakText": "2012 Ford Focus — 150 brake horsepower, Petrol."
}
```

---

## Step 2 — Create the Siri Shortcut (3 minutes)

1. On your iPhone, open the **Shortcuts** app
2. Tap **+** to create a new shortcut
3. Tap **Add Action** and add these actions in order:

### Action 1 — Ask for Input
- Action: **Ask for Input**
- Prompt: `What's the registration plate?`
- Input type: **Text**

### Action 2 — Get Contents of URL
- Action: **Get Contents of URL**
- URL: `https://bhp-lookup-yourname.vercel.app/api/bhp?reg=[Provided Input]`
  - Tap the URL field, type the base URL, then insert the **Provided Input** variable
- Method: **GET**

### Action 3 — Get Dictionary Value
- Action: **Get Dictionary Value**
- Get: **Value** for key: `speakText`
- From: **Contents of URL**

### Action 4 — Speak Text
- Action: **Speak Text**
- Text: **Dictionary Value**

4. Tap the shortcut name at the top and rename it to **"Check BHP"**
5. Tap **Done**

---

## Step 3 — Use it!

Say: **"Hey Siri, Check BHP"**

Siri will ask: *"What's the registration plate?"*

Say the plate (e.g. **"AB12 CDE"**)

Siri will respond: *"2012 Ford Focus — 150 brake horsepower, Petrol."*

---

## Troubleshooting

**"Could not find BHP data"** — Double-check the registration is correct. Some older or unusual vehicles may not have BHP data available on the free sites.

**Siri doesn't understand the plate** — Spell it out letter by letter if needed, e.g. "Alpha Bravo 1 2 Charlie Delta Echo".

**The API stops working** — The free scraping approach may occasionally break if the source websites change their layout. In that case, upgrading to the Rapid Car Check API (from £5.99/month) is the reliable fix.
