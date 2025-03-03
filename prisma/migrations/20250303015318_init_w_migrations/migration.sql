-- CreateTable
CREATE TABLE "Users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "password_salt" VARCHAR(255) NOT NULL,
    "plain_password" VARCHAR(255) NOT NULL,
    "uploaded_by_path" BOOLEAN NOT NULL DEFAULT false,
    "api_key" VARCHAR(255) NOT NULL,
    "type_id" SMALLINT NOT NULL,
    "status_id" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "Users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Metadata" (
    "id" SERIAL NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_mime" VARCHAR(60) NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "related_api_key" VARCHAR(255) NOT NULL,
    "status_id" SMALLINT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "Metadata_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User_status" (
    "id" SMALLSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "User_status_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User_type" (
    "id" SMALLSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "User_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "File_status" (
    "id" SMALLSERIAL NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ,

    CONSTRAINT "File_status_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Users_username_key" ON "Users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Users_email_key" ON "Users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Users_api_key_key" ON "Users"("api_key");

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "User_status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Users" ADD CONSTRAINT "Users_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "User_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metadata" ADD CONSTRAINT "Metadata_related_api_key_fkey" FOREIGN KEY ("related_api_key") REFERENCES "Users"("api_key") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metadata" ADD CONSTRAINT "Metadata_status_id_fkey" FOREIGN KEY ("status_id") REFERENCES "File_status"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
