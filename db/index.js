// ══════════════════════════════════════════════════════════════
// ELINGU DATABASE ACCESS LAYER (MAIN ENTRYPOINT)
// Re-exports database client methods and specialized repositories
// ══════════════════════════════════════════════════════════════

const client = require('./client');

module.exports = {
  // Database client methods
  query: client.query,
  querySync: client.querySync,
  initSchema: client.initSchema,
  toJson: client.toJson,
  fromJson: client.fromJson,
  close: client.close,
  isPostgres: client.isPostgres,
  DB_FILE: client.DB_FILE,

  // Repositories
  schools: require('./repositories/schoolsRepository'),
  teachers: require('./repositories/teachersRepository'),
  students: require('./repositories/studentsRepository'),
  missions: require('./repositories/missionsRepository'),
  sessions: require('./repositories/sessionsRepository'),
  parents: require('./repositories/parentsRepository')
};
