ALTER TABLE "ExtensionInstallation"
ADD COLUMN "deviceLabel" TEXT,
ADD COLUMN "platform" TEXT,
ADD COLUMN "osName" TEXT,
ADD COLUMN "osVersion" TEXT,
ADD COLUMN "browserName" TEXT,
ADD COLUMN "browserVersion" TEXT,
ADD COLUMN "userAgent" TEXT;
