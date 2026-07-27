-- CreateTable
CREATE TABLE "InvitacionUsuario" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiraEn" TIMESTAMP(3) NOT NULL,
    "usadaEn" TIMESTAMP(3),
    "creadoPorId" TEXT,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InvitacionUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InvitacionUsuario_usuarioId_key" ON "InvitacionUsuario"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "InvitacionUsuario_token_key" ON "InvitacionUsuario"("token");

-- AddForeignKey
ALTER TABLE "InvitacionUsuario" ADD CONSTRAINT "InvitacionUsuario_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
