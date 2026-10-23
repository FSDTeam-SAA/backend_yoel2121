import { randomInt } from "node:crypto";

export const generateOTP = () => String(randomInt(100000, 1000000));
