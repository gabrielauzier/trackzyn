// Management commands: `npm run cli -- create-user|create-admin <email> <password>`.
import { fileURLToPath } from 'node:url'
import { loadConfig } from './config.ts'
import { buildContext } from './context.ts'
import type { Database } from './db/client.ts'
import { getUserByEmail, registerUser } from './services/users.ts'

export const USAGE = `CLI commands for managing the application.

    npm run cli -- create-user <email> <password>
    npm run cli -- create-admin <email> <password>
`

export type CliResult = { code: number; output: string }

/** Runs one command against `db`; returns what to print and the exit code. */
export async function runCli(db: Database, argv: string[]): Promise<CliResult> {
  const [command, email, password] = argv
  if (argv.length !== 3 || (command !== 'create-user' && command !== 'create-admin')) {
    return { code: 1, output: USAGE }
  }
  if (await getUserByEmail(db, email as string)) {
    return { code: 1, output: `Error: User with email '${email}' already exists.\n` }
  }
  const superuser = command === 'create-admin'
  await registerUser(db, { email: email as string, password: password as string, isSuperuser: superuser, isVerified: true })
  return { code: 0, output: `${superuser ? 'Admin' : 'User'} created successfully: ${email}\n` }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const argumentsOk = argv.length === 3 && (argv[0] === 'create-user' || argv[0] === 'create-admin')
  if (!argumentsOk) {
    process.stdout.write(USAGE)
    process.exit(1)
  }
  const { ctx, close } = await buildContext(loadConfig(), { ports: false })
  try {
    const result = await runCli(ctx.db, argv)
    process.stdout.write(result.output)
    process.exitCode = result.code
  } finally {
    await close()
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
