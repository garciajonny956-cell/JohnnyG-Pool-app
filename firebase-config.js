// =====================================================================
//  FIREBASE SETTINGS  -  this is the ONLY code file you need to edit.
// =====================================================================
//
//  Where to get these values:
//    1. Go to https://console.firebase.google.com and open your project.
//    2. Click the gear icon (top left, next to "Project Overview")
//       and choose "Project settings".
//    3. Scroll down to "Your apps". If there is no web app yet, click
//       the  </>  (Web) button, give it a nickname, and click "Register app".
//    4. Firebase shows a block of code with "const firebaseConfig = { ... }".
//       Copy each value (the text inside the quotes) and paste it below,
//       replacing the matching YOUR_... placeholder. Keep the quotes.
//
//  These values are safe to put on a public website. Your data is
//  protected by the security rules (firestore.rules), not by hiding these.
// =====================================================================

export const firebaseConfig = {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_PROJECT.firebaseapp.com",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_PROJECT.appspot.com",
    messagingSenderId: "YOUR_MESSAGING_ID",
    appId: "YOUR_APP_ID"
};

// ---------------------------------------------------------------------
//  BUSINESS INFO  -  shown on receipts. Edit the text inside the quotes.
//  Leave a line as "" if you don't want it on the receipt.
// ---------------------------------------------------------------------
export const businessInfo = {
    name: "Johnny G's Pool Service, Tile & Metal",
    city: "Edinburg, TX",
    phone: "",   // example: "(956) 555-0123"
    email: ""    // example: "johnny@example.com"
};
