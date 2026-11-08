# Setting Up Your Johnny G's App

This takes about 20 minutes. Everything here is **free**. You only need a Google account and your GitHub account.

**Your app files:** `index.html`, `style.css`, `app.js`, `firebase-config.js` (the website) and `firestore.rules` (the security rules). The only file you edit is `firebase-config.js`.

---

## Step 1: Create a free Firebase project
1. Go to **https://console.firebase.google.com** and sign in with your Google account.
2. Click **Create a project** (or **Add project**).
3. Name it something like `johnnyg-pool`. Click **Continue**.
4. Google Analytics: turn it **off**. Click **Create project**, then **Continue**.

You are on the free "Spark" plan. Don't add a credit card. You don't need one.

## Step 2: Turn on email and password login
1. In the left menu, click **Build > Authentication**, then **Get started**.
2. Click **Email/Password**, switch the first toggle **on**, and click **Save**.

## Step 3: Create the database
1. In the left menu, click **Build > Firestore Database**, then **Create database**.
2. Pick a location in the US (for example `nam5 (United States)`). Click **Next**.
3. Choose **Start in production mode**. Click **Create**.

## Step 4: Connect the app to your project
1. Click the **gear icon** next to "Project Overview" (top left), then **Project settings**.
2. Scroll down to **Your apps** and click the **`</>`** (Web) button.
3. Nickname: `johnnyg-web`. Leave "Firebase Hosting" unchecked. Click **Register app**.
4. You'll see a code box with `const firebaseConfig = { apiKey: "...", ... }`.
5. Open **`firebase-config.js`** in a text editor (Notepad on Windows, TextEdit on Mac).
6. Replace each `YOUR_...` placeholder with the matching value from Firebase. Keep the quotes.
7. In the same file, under **BUSINESS INFO**, type your business phone and email between the quotes if you want them printed on receipts.
8. Save the file.

> It's safe to have these values on a public website. Your data is protected by the rules in Step 5.

## Step 5: Paste the security rules
1. In Firebase, go to **Firestore Database**, then click the **Rules** tab.
2. Delete everything in the box.
3. Open **`firestore.rules`**, copy **all** of it, and paste it into the box.
4. Click **Publish**.

## Step 6: Create your owner account (only you)
1. Go to **Authentication** and open the **Users** tab. Click **Add user**.
2. Enter your email and a strong password. Click **Add user**.
3. Your new user shows up in the list. Copy the long code in the **User UID** column.
4. Go to **Firestore Database** and open the **Data** tab. Click **+ Start collection**.
5. Collection ID: `users`. Click **Next**.
6. Document ID: **paste your User UID**.
7. Add a field: Field = `role`, Type = `string`, Value = `owner`.
8. Add another field: Field = `email`, Type = `string`, Value = your email.
9. Click **Save**.

This is the only way to become the owner, so customers can never give themselves owner access.

## Step 7: Put the app online for free (GitHub Pages)
1. Go to **https://github.com** and sign in.
2. Click **+** (top right) and choose **New repository**.
3. Name it `johnnyg-app`, choose **Public**, and click **Create repository**.
4. Click **uploading an existing file**. Drag in `index.html`, `style.css`, `app.js`, `firebase-config.js`, and `firestore.rules`. Then click **Commit changes**.
5. Click the **Settings** tab, then **Pages** in the left menu.
6. Under **Branch**, choose **main** and **/ (root)**, then click **Save**.
7. Wait 1 to 2 minutes and refresh the page. When "Your site is live at..." appears, that's your web address. It will look like
   `https://garciajonny956-cell.github.io/johnnyg-app/`

## Step 8: Allow your web address in Firebase
1. In Firebase, go to **Authentication** and open the **Settings** tab, then **Authorized domains**.
2. Click **Add domain** and type `garciajonny956-cell.github.io` (no `https://`, nothing after `.io`). Click **Add**.

## Step 9: Start using it
1. Open your web address and log in with the owner account from Step 6.
2. **Payment Settings:** click **Edit** and enter your Cash App $cashtag, Zelle email or phone, Chime $ChimeSign, and Square payment link. Fill in only the ones you use, then click **Save**. These show up as Pay buttons for customers. Money goes straight to your accounts, and the app never handles it.
3. **Add Customer:** enter each customer's name, **email**, phone, address, and pool notes.
4. **Log New Service** after each visit. **Send Email Receipt** opens your email app with the receipt filled in so you can review it and press Send. **Print / Save as PDF** gives you a paper or PDF copy.

### How customers get access
1. Add them as a customer (with their email).
2. Text them your web address and tell them to tap **"New customer? Create account"** and use **that same email**.
3. They click the link in the verification email Firebase sends them, then log in.
4. They can see their visits and balance, pay you, tap **I've Paid**, and request a visit.
5. When you see the money, go to the log and tap **Confirm Paid**. Only you can mark something paid.

---

## If something goes wrong
- **Yellow box saying "not connected to Firebase":** `firebase-config.js` still has `YOUR_...` in it (Step 4), or you didn't upload the edited file.
- **"This website address isn't approved":** do Step 8.
- **You log in as owner but see "Check your email":** your `users` document is missing or `role` isn't exactly `owner` in lowercase (Step 6).
- **A customer gets "couldn't find you on the customer list":** add them with the exact email they signed up with, then have them log in again.
- **Verification or reset emails aren't arriving:** have them check spam. To change who the emails come from, go to **Authentication > Templates**.
- **You changed a file:** upload it again on GitHub (**Add file > Upload files**, same name). The site updates in 1 to 2 minutes.
