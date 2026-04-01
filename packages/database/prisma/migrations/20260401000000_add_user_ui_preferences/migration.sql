-- AlterTable: add uiPreferences JSONB column to User
ALTER TABLE "User" ADD COLUMN "uiPreferences" JSONB;
