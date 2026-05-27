-- Staff mobile — store latest Expo push token per user (employee app).
ALTER TABLE "User" ADD COLUMN "expoPushToken" VARCHAR(200);
