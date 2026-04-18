import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { DbInstance } from "../db/index.js";

export function registerBackupTools(server: McpServer, dbInstance: DbInstance, dbPath: string): void {
  const backupsDir = path.join(path.dirname(path.dirname(dbPath)), "backups");

  // ── backup_bible ────────────────────────────────────────────────
  server.tool(
    "backup_bible",
    "Crée une sauvegarde de la bible dans le dossier backups/.",
    {
      label: z.string().optional().describe("Label optionnel ajouté au nom du fichier de backup"),
    },
    async ({ label }) => {
      // Créer le dossier backups/ si nécessaire
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      // Générer le nom du fichier avec timestamp
      const now = new Date();
      const timestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/(\d{8})(\d{6})/, "$1_$2");
      const safeName = label
        ? `bible_${timestamp}_${label.replace(/[^a-zA-Z0-9_-]/g, "_")}.db`
        : `bible_${timestamp}.db`;

      const backupPath = path.join(backupsDir, safeName);

      // Checkpoint WAL pour s'assurer que toutes les données sont dans le fichier .db
      dbInstance.sqlite.pragma("wal_checkpoint(TRUNCATE)");

      // Copier le fichier DB
      fs.copyFileSync(dbPath, backupPath);

      const stats = fs.statSync(backupPath);

      console.error(`[backup] Backup créé : ${safeName} (${stats.size} octets)`);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                backup: safeName,
                path: backupPath,
                size: stats.size,
                createdAt: now.toISOString(),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── restore_bible ───────────────────────────────────────────────
  server.tool(
    "restore_bible",
    "Restaure la bible depuis un fichier de backup. Vérifie l'intégrité et sauvegarde la bible actuelle avant restauration.",
    {
      backup_name: z.string().describe("Nom du fichier de backup (ex: bible_20260325_143000.db)"),
    },
    async ({ backup_name }) => {
      // Sécurité : vérifier que le chemin résolu est dans backups/
      const resolvedBackup = path.resolve(backupsDir, backup_name);
      const resolvedBackupsDir = path.resolve(backupsDir);

      if (!resolvedBackup.startsWith(resolvedBackupsDir + path.sep) && resolvedBackup !== resolvedBackupsDir) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: "Erreur de sécurité : le chemin du backup doit rester dans le dossier backups/. Path traversal détecté.",
            },
          ],
        };
      }

      // Vérifier que le fichier existe
      if (!fs.existsSync(resolvedBackup)) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Fichier de backup non trouvé : ${backup_name}`,
            },
          ],
        };
      }

      // Vérifier l'intégrité du backup
      let testDb: ReturnType<typeof Database> | null = null;
      try {
        testDb = new Database(resolvedBackup, { readonly: true });
        const result = testDb.pragma("integrity_check") as Array<{ integrity_check: string }>;
        const ok = result.length === 1 && result[0].integrity_check === "ok";
        if (!ok) {
          return {
            isError: true,
            content: [
              {
                type: "text" as const,
                text: `Le fichier de backup est corrompu. PRAGMA integrity_check : ${JSON.stringify(result)}`,
              },
            ],
          };
        }
      } catch (err) {
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `Impossible d'ouvrir le backup : ${err instanceof Error ? err.message : String(err)}`,
            },
          ],
        };
      } finally {
        testDb?.close();
      }

      // Créer le dossier backups/ si nécessaire
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      // Sauvegarde automatique de la bible actuelle avant restore
      const now = new Date();
      const autoTimestamp = now.toISOString().replace(/[-:T]/g, "").slice(0, 15).replace(/(\d{8})(\d{6})/, "$1_$2");
      const autoBackupName = `bible_${autoTimestamp}_pre-restore.db`;
      const autoBackupPath = path.join(backupsDir, autoBackupName);
      fs.copyFileSync(dbPath, autoBackupPath);

      console.error(`[backup] Sauvegarde automatique avant restore : ${autoBackupName}`);

      // Checkpoint WAL avant restore pour vider le journal
      dbInstance.sqlite.pragma("wal_checkpoint(TRUNCATE)");

      // Remplacer la bible par le backup
      fs.copyFileSync(resolvedBackup, dbPath);

      // Supprimer les fichiers WAL/SHM pour éviter que l'ancien journal ne pollue la DB restaurée
      const walPath = dbPath + "-wal";
      const shmPath = dbPath + "-shm";
      try { if (fs.existsSync(walPath)) fs.unlinkSync(walPath); } catch { /* ignore */ }
      try { if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath); } catch { /* ignore */ }

      console.error(`[backup] Bible restaurée depuis : ${backup_name}`);

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(
              {
                restored: backup_name,
                autoBackup: autoBackupName,
                message: "Bible restaurée avec succès. Un redémarrage du serveur peut être nécessaire pour recharger la base.",
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  // ── list_backups ────────────────────────────────────────────────
  server.tool(
    "list_backups",
    "Liste tous les fichiers de backup disponibles avec leur taille et date.",
    {},
    async () => {
      if (!fs.existsSync(backupsDir)) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify({ backups: [], message: "Aucun backup trouvé (dossier backups/ inexistant)." }, null, 2),
            },
          ],
        };
      }

      const files = fs.readdirSync(backupsDir).filter((f) => f.endsWith(".db"));

      const backups = files
        .map((name) => {
          const filePath = path.join(backupsDir, name);
          const stats = fs.statSync(filePath);
          return {
            name,
            size: stats.size,
            modifiedAt: stats.mtime.toISOString(),
          };
        })
        .sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ total: backups.length, backups }, null, 2),
          },
        ],
      };
    },
  );

  console.error("[tools] Backup tools enregistrés");
}
