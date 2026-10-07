const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');

['data/gcserver.sqlite', 'release/GC-Hub-Server/data/gcserver.sqlite'].forEach(dbRelPath => {
  const fullPath = path.resolve(rootDir, dbRelPath);
  if (fs.existsSync(fullPath)) {
    console.log(`\n=== Cleaning Database: ${dbRelPath} ===`);
    const db = new Database(fullPath);
    
    // Check all workstations
    const before = db.prepare('SELECT id, pcId, name, state FROM Workstations').all();
    console.log('Workstations Before:', before);

    // Delete probe / test workstations
    const deleted = db.prepare("DELETE FROM Workstations WHERE pcId LIKE 'PC-PROBE%' OR pcId LIKE 'PC-REMOTE%' OR name LIKE '%Probe%'").run();
    console.log(`Deleted ${deleted.changes} test workstation record(s).`);

    // Workstations after
    const after = db.prepare('SELECT id, pcId, name, state FROM Workstations').all();
    console.log('Workstations After:', after);
    
    db.close();
  }
});

console.log('\n[SUCCESS] SQLite Workstations cleaned up successfully.');
process.exit(0);
