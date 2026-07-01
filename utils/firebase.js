import fs from "fs";
import path from "path";
import { initializeApp, cert } from "firebase-admin/app";
import { getMessaging as getFirebaseMessaging } from "firebase-admin/messaging";

let messaging = null;

export const initFirebase = () => {
  if (messaging) return;

  const credPath =
    process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
    "./zentrofix-31729-firebase-adminsdk-fbsvc-8064c5cfa2.json";
  const resolvedPath = path.resolve(credPath);

  if (!fs.existsSync(resolvedPath)) {
    console.warn(
      `[firebase] service account file not found at ${resolvedPath} — push notifications disabled`
    );
    return;
  }

  const serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf-8"));

  const app = initializeApp({
    credential: cert(serviceAccount),
  });

  messaging = getFirebaseMessaging(app);
  console.log("[firebase] admin SDK initialized — push notifications enabled");
};

export const getMessaging = () => messaging;
