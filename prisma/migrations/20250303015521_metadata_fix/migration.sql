/*
  Warnings:

  - The primary key for the `Metadata` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- AlterTable
ALTER TABLE "Metadata" DROP CONSTRAINT "Metadata_pkey",
ALTER COLUMN "id" DROP DEFAULT,
ALTER COLUMN "id" SET DATA TYPE VARCHAR(255),
ADD CONSTRAINT "Metadata_pkey" PRIMARY KEY ("id");
DROP SEQUENCE "Metadata_id_seq";
