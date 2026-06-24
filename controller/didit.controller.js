import crypto from "crypto";
import { User } from "../model/user.model.js";

const TERMINAL_STATUSES = ["Approved", "Declined"];

export const diditWebhook = async (req, res) => {
  console.log("Received Didit webhook:", req.body);
  try {
    const timestamp = req.headers["x-timestamp"];
    const signatureSimple = req.headers["x-signature-simple"];

    if (!timestamp || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) {
      return res.status(400).json({ error: "Invalid or stale timestamp" });
    }

    const { session_id, status, webhook_type, vendor_data } = req.body;

    const expected = crypto
      .createHmac("sha256", process.env.DIDIT_WEBHOOK_SECRET)
      .update(`${timestamp}:${session_id}:${status}:${webhook_type}`)
      .digest("hex");

    let sigBuf, expectedBuf;
    try {
      sigBuf = Buffer.from(signatureSimple || "", "hex");
      expectedBuf = Buffer.from(expected, "hex");
    } catch {
      return res.status(401).json({ error: "Invalid signature" });
    }

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return res.status(401).json({ error: "Invalid signature" });
    }

    if (vendor_data && TERMINAL_STATUSES.includes(status)) {
      await User.findByIdAndUpdate(vendor_data, {
        isKycVerified: status === "Approved",
      });
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error("Didit webhook error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};
