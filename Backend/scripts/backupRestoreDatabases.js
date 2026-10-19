/**
 * AGRI-SWAP SQLite Database Backup & Restore Utility
 * ==================================================
 * Provides safe, verified backup and atomic restore procedures for:
 * 1. Backend/data/nutrition.db
 * 2. Backend/data/historical_prices.db
 *
 * Usage:
 *   node Backend/scripts/backupRestoreDatabases.js status
 *   node Backend/scripts/backupRestoreDatabases.js backup
 *   node Backend/scripts/backupRestoreDatabases.js restore --db=nutrition --latest
 *   node Backend/scripts/backupRestoreDatabases.js restore --db=historical --latest
 *   node Backend/scripts/backupRestoreDatabases.js restore --all --latest
 */

const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = path.join(__dirname, "../data");
const BACKUPS_DIR = path.join(DATA_DIR, "backups");

const DB_TARGETS = {
    nutrition: {
        name: "nutrition.db",
        activePath: path.join(DATA_DIR, "nutrition.db"),
        prefix: "nutrition_backup_"
    },
    historical: {
        name: "historical_prices.db",
        activePath: path.join(DATA_DIR, "historical_prices.db"),
        prefix: "historical_prices_backup_"
    }
};

function ensureDir(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

function verifyIntegrity(filePath) {
    if (!fs.existsSync(filePath)) {
        return { ok: false, error: "File does not exist: " + filePath };
    }
    try {
        const db = new DatabaseSync(filePath, { readOnly: true });
        const row = db.prepare("PRAGMA integrity_check;").get();
        db.close();
        const isOk = row && (row.integrity_check === "ok" || Object.values(row)[0] === "ok");
        return { ok: Boolean(isOk), details: row };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

function getDatabaseStats(filePath, type) {
    if (!fs.existsSync(filePath)) {
        return { exists: false };
    }
    const stat = fs.statSync(filePath);
    const integrity = verifyIntegrity(filePath);
    const result = {
        exists: true,
        sizeBytes: stat.size,
        sizeMb: (stat.size / (1024 * 1024)).toFixed(2) + " MB",
        integrityOk: integrity.ok,
        lastModified: stat.mtime.toISOString()
    };

    if (integrity.ok) {
        try {
            const db = new DatabaseSync(filePath, { readOnly: true });
            if (type === "nutrition") {
                const pRow = db.prepare("SELECT COUNT(*) as c FROM food_nutrition_profiles").get();
                const mRow = db.prepare("SELECT value FROM nutrition_metadata WHERE key = 'version'").get();
                result.totalProfiles = pRow ? pRow.c : 0;
                result.version = mRow ? mRow.value : "unknown";
            } else if (type === "historical") {
                const qRow = db.prepare("SELECT COUNT(*) as c FROM historical_query_cache").get();
                result.cachedQueries = qRow ? qRow.c : 0;
            }
            db.close();
        } catch (_) {}
    }
    return result;
}

function backupDatabase(key) {
    ensureDir(BACKUPS_DIR);
    const target = DB_TARGETS[key];
    if (!target) throw new Error("Unknown database target: " + key);

    if (!fs.existsSync(target.activePath)) {
        throw new Error("Active database file not found: " + target.activePath);
    }

    const check = verifyIntegrity(target.activePath);
    if (!check.ok) {
        throw new Error(`Active database ${target.name} failed integrity check prior to backup: ${check.error}`);
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupFileName = `${target.prefix}${timestamp}.db`;
    const backupPath = path.join(BACKUPS_DIR, backupFileName);

    // Perform atomic VACUUM INTO for consistent SQLite snapshot without WAL locks
    try {
        const db = new DatabaseSync(target.activePath, { readOnly: false });
        db.exec(`VACUUM INTO '${backupPath.replace(/\\/g, "/")}'`);
        db.close();
    } catch (vacuumErr) {
        // Fallback to synchronous file copy
        fs.copyFileSync(target.activePath, backupPath);
    }

    const backupCheck = verifyIntegrity(backupPath);
    if (!backupCheck.ok) {
        if (fs.existsSync(backupPath)) fs.unlinkSync(backupPath);
        throw new Error(`Backup verification failed for ${backupFileName}: ${backupCheck.error}`);
    }

    const stat = fs.statSync(backupPath);
    return {
        success: true,
        database: key,
        backupFile: backupFileName,
        backupPath,
        sizeMb: (stat.size / (1024 * 1024)).toFixed(2) + " MB",
        timestamp
    };
}

function listBackups(key) {
    ensureDir(BACKUPS_DIR);
    const target = DB_TARGETS[key];
    if (!target) return [];

    const files = fs.readdirSync(BACKUPS_DIR)
        .filter(f => f.startsWith(target.prefix) && f.endsWith(".db"))
        .map(f => {
            const p = path.join(BACKUPS_DIR, f);
            const s = fs.statSync(p);
            return {
                fileName: f,
                filePath: p,
                sizeBytes: s.size,
                sizeMb: (s.size / (1024 * 1024)).toFixed(2) + " MB",
                createdAt: s.mtime.toISOString()
            };
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    return files;
}

function restoreDatabase(key, backupFilePath) {
    const target = DB_TARGETS[key];
    if (!target) throw new Error("Unknown database target: " + key);

    let sourceFile = backupFilePath;
    if (!sourceFile || sourceFile === "latest") {
        const backups = listBackups(key);
        if (backups.length === 0) {
            throw new Error(`No backups found in ${BACKUPS_DIR} for ${key}`);
        }
        sourceFile = backups[0].filePath;
    }

    if (!fs.existsSync(sourceFile)) {
        throw new Error("Backup file not found: " + sourceFile);
    }

    // 1. Verify backup integrity BEFORE touching the active database
    const backupCheck = verifyIntegrity(sourceFile);
    if (!backupCheck.ok) {
        throw new Error(`Corrupted backup file. Integrity check failed: ${backupCheck.error}`);
    }

    // 2. Create emergency pre-restore snapshot of existing file if it exists
    if (fs.existsSync(target.activePath)) {
        const emergencyPath = path.join(BACKUPS_DIR, `emergency_pre_restore_${target.prefix}${Date.now()}.db`);
        fs.copyFileSync(target.activePath, emergencyPath);
    }

    // 3. Remove existing WAL and SHM locks to prevent corrupt mixing
    const walFile = `${target.activePath}-wal`;
    const shmFile = `${target.activePath}-shm`;
    if (fs.existsSync(walFile)) {
        try { fs.unlinkSync(walFile); } catch (_) {}
    }
    if (fs.existsSync(shmFile)) {
        try { fs.unlinkSync(shmFile); } catch (_) {}
    }

    // 4. Safely copy backup to active path
    fs.copyFileSync(sourceFile, target.activePath);

    // 5. Verify the restored active database
    const restoredCheck = verifyIntegrity(target.activePath);
    if (!restoredCheck.ok) {
        throw new Error(`Restoration failed integrity check: ${restoredCheck.error}`);
    }

    return {
        success: true,
        database: key,
        restoredFrom: sourceFile,
        activePath: target.activePath,
        integrityOk: true
    };
}

function printStatus() {
    console.log("=================================================");
    console.log("AGRI-SWAP SQLite Storage & Backup Diagnostics");
    console.log("=================================================\n");

    for (const [key, target] of Object.entries(DB_TARGETS)) {
        const stats = getDatabaseStats(target.activePath, key);
        console.log(`[${key.toUpperCase()}] ${target.name}`);
        console.log(`  Path: ${target.activePath}`);
        console.log(`  Exists: ${stats.exists}`);
        if (stats.exists) {
            console.log(`  Size: ${stats.sizeMb}`);
            console.log(`  Integrity: ${stats.integrityOk ? "✓ PASSED (ok)" : "✗ FAILED"}`);
            if (stats.totalProfiles !== undefined) {
                console.log(`  Profiles count: ${stats.totalProfiles}`);
                console.log(`  Schema version: ${stats.version}`);
            }
            if (stats.cachedQueries !== undefined) {
                console.log(`  Cached queries: ${stats.cachedQueries}`);
            }
        }
        const backups = listBackups(key);
        console.log(`  Available backups in ${path.basename(BACKUPS_DIR)}: ${backups.length}`);
        backups.slice(0, 3).forEach(b => {
            console.log(`    - ${b.fileName} (${b.sizeMb}, ${b.createdAt})`);
        });
        console.log("");
    }
}

// CLI Driver
if (require.main === module) {
    const args = process.argv.slice(2);
    const command = (args[0] || "status").toLowerCase();

    try {
        if (command === "status") {
            printStatus();
        } else if (command === "backup") {
            console.log("Creating safe verified backups for AGRI-SWAP SQLite databases...\n");
            const nutRes = backupDatabase("nutrition");
            console.log(`✓ Nutrition backup: ${nutRes.backupFile} (${nutRes.sizeMb})`);
            const histRes = backupDatabase("historical");
            console.log(`✓ Historical prices backup: ${histRes.backupFile} (${histRes.sizeMb})`);
            console.log("\nBackup operation completed successfully.");
        } else if (command === "restore") {
            const dbArg = args.find(a => a.startsWith("--db="))?.split("=")[1];
            const fileArg = args.find(a => a.startsWith("--file="))?.split("=")[1] || "latest";
            const allArg = args.includes("--all");

            if (allArg || dbArg === "all") {
                console.log("Restoring all databases from latest backups...");
                const nutRes = restoreDatabase("nutrition", "latest");
                console.log(`✓ Restored nutrition from: ${nutRes.restoredFrom}`);
                const histRes = restoreDatabase("historical", "latest");
                console.log(`✓ Restored historical from: ${histRes.restoredFrom}`);
            } else if (dbArg === "nutrition" || dbArg === "historical") {
                console.log(`Restoring ${dbArg} from: ${fileArg}...`);
                const res = restoreDatabase(dbArg, fileArg);
                console.log(`✓ Restored ${dbArg} successfully from: ${res.restoredFrom}`);
            } else {
                console.error("Usage: node backupRestoreDatabases.js restore --db=nutrition|historical|all [--file=<path>|--latest]");
                process.exit(1);
            }
        } else {
            console.error(`Unknown command: ${command}. Use status, backup, or restore.`);
            process.exit(1);
        }
    } catch (e) {
        console.error("❌ Operation failed:", e.message);
        process.exit(1);
    }
}

module.exports = {
    backupDatabase,
    restoreDatabase,
    verifyIntegrity,
    listBackups,
    getDatabaseStats
};
