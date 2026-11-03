// Applies the schema to DATABASE_URL and exits: `npm run migrate`.
import { loadConfig } from './config.ts'
import { connectPostgres } from './db/client.ts'
import { applyMigrations } from './db/migrate.ts'

const config = loadConfig()
const database = connectPostgres(config.pgConnectionString)
try {
  await applyMigrations(database.db)
  console.log('migrations applied')
} catch (error) {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
} finally {
  await database.close()
}
